use parking_lot::{Condvar, Mutex};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use tauri::{AppHandle, Emitter};

use crate::compile_artifacts::{compile_document, render_svgs_incremental, write_svg_pages, SvgPageCache};
use crate::compile_events::RESOURCES_UPDATED_EVENT;
use crate::document_session::DocumentSession;
use crate::path_utils::file_id_for_virtual_path;
use crate::resource_watch;
use crate::vfs::VirtualFileSystem;
use crate::world::ErgoWorld;

/// Background worker for **resource preview SVGs** only. Main document preview compiles in WASM.
pub struct TypstWatch {
    vfs: Arc<VirtualFileSystem>,
    condvar: Condvar,
    wait_mutex: Mutex<()>,
    running: AtomicBool,
    resources_pending: AtomicBool,
}

impl TypstWatch {
    pub fn new(vfs: Arc<VirtualFileSystem>) -> Self {
        Self {
            vfs,
            condvar: Condvar::new(),
            wait_mutex: Mutex::new(()),
            running: AtomicBool::new(false),
            resources_pending: AtomicBool::new(false),
        }
    }

    pub fn ensure_running(self: &Arc<Self>, app: AppHandle, document_session: Arc<DocumentSession>) {
        if !self.running.swap(true, Ordering::SeqCst) {
            let watch = Arc::clone(self);
            thread::spawn(move || watch.run(app, document_session));
        } else {
            self.condvar.notify_one();
        }
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        self.condvar.notify_one();
    }

    pub fn mark_resources_pending(&self) {
        self.resources_pending.store(true, Ordering::SeqCst);
        self.condvar.notify_one();
    }

    fn run(self: Arc<Self>, app: AppHandle, document_session: Arc<DocumentSession>) {
        loop {
            {
                let mut guard = self.wait_mutex.lock();
                while self.running.load(Ordering::SeqCst)
                    && !self.resources_pending.load(Ordering::SeqCst)
                {
                    self.condvar.wait(&mut guard);
                }
            }

            if !self.running.load(Ordering::SeqCst) {
                return;
            }

            if self.resources_pending.swap(false, Ordering::SeqCst) {
                Self::compile_resource_previews(&app, &self.vfs, &document_session);
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
        resource_watch::write_resource_files(vfs, &ast, &template, &lib_source);

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
                let resources = resource_watch::build_resource_catalog_with_failure(
                    &ast,
                    &template,
                    vfs,
                    message.to_string(),
                );
                let _ = app.emit(RESOURCES_UPDATED_EVENT, resources);
                return;
            }
        }

        let resources = resource_watch::build_resource_catalog(&ast, &template, vfs);
        let _ = app.emit(RESOURCES_UPDATED_EVENT, resources);
    }
}
