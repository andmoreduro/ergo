use parking_lot::{Condvar, Mutex};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use tauri::{AppHandle, Emitter};

use crate::compilation_types::{CompilationResult, CompilationStatus, SourceRevision};
use crate::compile_artifacts::{
    compile_document, render_svgs_incremental, write_svg_pages, SvgPageCache,
};
use crate::compile_events::{
    emit_compile_event, COMPILE_FAILED_EVENT, COMPILE_STARTED_EVENT, COMPILE_SUCCEEDED_EVENT,
    RESOURCES_UPDATED_EVENT,
};
use crate::document_outline::extract_outline;
use crate::document_session::DocumentSession;
use crate::path_utils::file_id_for_virtual_path;
use crate::preview_sync::PreviewSyncState;
use crate::vfs::VirtualFileSystem;
use crate::world::{ErgoWorld, WorldSourceSnapshot};

struct WatchInner {
    last_compiled_revision: SourceRevision,
    last_result: Option<CompilationResult>,
}

pub struct TypstWatch {
    vfs: Arc<VirtualFileSystem>,
    inner: Mutex<WatchInner>,
    condvar: Condvar,
    running: AtomicBool,
    resources_pending: AtomicBool,
}

impl TypstWatch {
    pub fn new(vfs: Arc<VirtualFileSystem>) -> Self {
        Self {
            vfs,
            inner: Mutex::new(WatchInner {
                last_compiled_revision: 0,
                last_result: None,
            }),
            condvar: Condvar::new(),
            running: AtomicBool::new(false),
            resources_pending: AtomicBool::new(false),
        }
    }

    pub fn ensure_running(
        self: &Arc<Self>,
        app: AppHandle,
        document_session: Arc<DocumentSession>,
        preview_sync: Arc<PreviewSyncState>,
    ) {
        if !self.running.swap(true, Ordering::SeqCst) {
            let watch = Arc::clone(self);
            thread::spawn(move || watch.run(app, document_session, preview_sync));
        } else {
            self.condvar.notify_one();
        }
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        self.condvar.notify_one();
    }

    pub fn mark_vfs_changed(&self) {
        self.condvar.notify_one();
    }

    pub fn mark_resources_pending(&self) {
        self.resources_pending.store(true, Ordering::SeqCst);
        self.condvar.notify_one();
    }

    pub fn snapshot(&self) -> WatchSnapshot {
        let inner = self.inner.lock();
        WatchSnapshot {
            latest_source_revision: self.vfs.latest_revision(),
            last_compiled_revision: inner.last_compiled_revision,
            last_result: inner.last_result.clone(),
        }
    }

    fn run(
        self: Arc<Self>,
        app: AppHandle,
        document_session: Arc<DocumentSession>,
        preview_sync: Arc<PreviewSyncState>,
    ) {
        let world = ErgoWorld::new(
            Arc::clone(&self.vfs),
            file_id_for_virtual_path("main.typ"),
        );
        let mut svg_cache = SvgPageCache::new();

        loop {
            let needs_preview = {
                let mut inner = self.inner.lock();
                while self.running.load(Ordering::SeqCst)
                    && inner.last_compiled_revision >= self.vfs.latest_revision()
                    && !self.resources_pending.load(Ordering::SeqCst)
                {
                    self.condvar.wait(&mut inner);
                }
                if !self.running.load(Ordering::SeqCst) {
                    return;
                }
                inner.last_compiled_revision < self.vfs.latest_revision()
            };

            if self.resources_pending.swap(false, Ordering::SeqCst) {
                Self::compile_resource_previews(&app, &self.vfs, &document_session);
            }

            if !needs_preview {
                continue;
            }

            let source_revision = self.vfs.latest_revision();

            let started_result = CompilationResult {
                source_revision,
                status: CompilationStatus::Started,
                preview_pages: None,
                export_path: None,
                diagnostics: Vec::new(),
                outline: None,
                resources: None,
            };
            emit_compile_event(&app, COMPILE_STARTED_EVENT, started_result);

            match compile_document(&world) {
                Ok(document) => {
                    if self.vfs.latest_revision() != source_revision {
                        continue;
                    }

                    let svgs = render_svgs_incremental(&document, &mut svg_cache);
                    let preview_dir = ".ergproj/preview/svg";
                    let preview_pages = write_svg_pages(&self.vfs, preview_dir, &svgs);
                    let source_snapshot = WorldSourceSnapshot::from_vfs(&self.vfs);
                    let outline = extract_outline(&document);
                    let document_status = document_session.status_snapshot();

                    preview_sync.store_preview(
                        source_revision,
                        document,
                        document_status.source_map,
                        document_status.field_source_map,
                        source_snapshot,
                    );

                    if self.vfs.latest_revision() != source_revision {
                        continue;
                    }

                    let result = CompilationResult {
                        source_revision,
                        status: CompilationStatus::Succeeded,
                        preview_pages: Some(preview_pages),
                        export_path: Some(preview_dir.to_string()),
                        diagnostics: Vec::new(),
                        outline: Some(outline),
                        resources: None,
                    };

                    {
                        let mut inner = self.inner.lock();
                        inner.last_compiled_revision = source_revision;
                        inner.last_result = Some(result.clone());
                    }

                    emit_compile_event(&app, COMPILE_SUCCEEDED_EVENT, result);
                }
                Err(message) => {
                    if self.vfs.latest_revision() != source_revision {
                        continue;
                    }

                    let result = CompilationResult {
                        source_revision,
                        status: CompilationStatus::Failed,
                        preview_pages: None,
                        export_path: None,
                        diagnostics: vec![message.to_string()],
                        outline: None,
                        resources: None,
                    };

                    {
                        let mut inner = self.inner.lock();
                        inner.last_compiled_revision = source_revision;
                        inner.last_result = Some(result.clone());
                    }

                    emit_compile_event(&app, COMPILE_FAILED_EVENT, result);
                }
            }
        }
    }

    fn compile_resource_previews(
        app: &AppHandle,
        vfs: &Arc<VirtualFileSystem>,
        document_session: &Arc<DocumentSession>,
    ) {
        let Some(ast) = document_session.ast() else {
            return;
        };
        let template = crate::template_spec::load_bundled_template(&ast.metadata.template_id)
            .unwrap_or_else(|_| crate::template_spec::load_bundled_template("versatile-apa").unwrap());
        let lib_source = crate::document_resources::resource_preview_lib_source(&ast, &template);
        crate::resource_watch::write_resource_files(vfs, &ast, &template, &lib_source);

        let world = ErgoWorld::new(
            Arc::clone(vfs),
            file_id_for_virtual_path(crate::resource_watch::RESOURCE_WATCH_MAIN),
        );
        match compile_document(&world) {
            Ok(document) => {
                let mut cache = SvgPageCache::new();
                let svgs = render_svgs_incremental(&document, &mut cache);
                write_svg_pages(vfs, ".ergproj/resource-previews/svg", &svgs);
            }
            Err(message) => {
                let resources = crate::resource_watch::build_resource_catalog_with_failure(
                    &ast,
                    &template,
                    vfs,
                    message.to_string(),
                );
                let _ = app.emit(RESOURCES_UPDATED_EVENT, resources);
                return;
            }
        }

        let resources = crate::resource_watch::build_resource_catalog(&ast, &template, vfs);
        let _ = app.emit(RESOURCES_UPDATED_EVENT, resources);
    }
}

#[derive(Clone, Debug)]
pub struct WatchSnapshot {
    pub latest_source_revision: SourceRevision,
    pub last_compiled_revision: SourceRevision,
    pub last_result: Option<CompilationResult>,
}
