use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::VecDeque;
use std::hash::{Hash, Hasher};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use ts_rs::TS;
use typst::layout::PagedDocument;
use typst::syntax::{FileId, VirtualPath};

use crate::document_session::DocumentSession;
use crate::preview_sync::PreviewSyncState;
use crate::vfs::VirtualFileSystem;
use crate::world::ErgoWorld;

pub const COMPILE_QUEUED_EVENT: &str = "ergo-compile-queued";
pub const COMPILE_STARTED_EVENT: &str = "ergo-compile-started";
pub const COMPILE_SUCCEEDED_EVENT: &str = "ergo-compile-succeeded";
pub const COMPILE_FAILED_EVENT: &str = "ergo-compile-failed";
pub const COMPILE_DROPPED_EVENT: &str = "ergo-compile-dropped";

const DEFAULT_DEBOUNCE_MS: u64 = 0;

pub struct TauriAppState {
    pub vfs: Arc<VirtualFileSystem>,
    pub compilation_queue: Arc<CompilationQueue>,
    pub document_session: Arc<DocumentSession>,
    pub preview_sync: Arc<PreviewSyncState>,
}

pub type SourceRevision = u64;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub enum ExportFormat {
    Pdf,
    Png,
    Svg,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CompilationJobKind {
    PreviewSvg,
    Export { format: ExportFormat },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub enum CompilationPriority {
    Preview,
    Export,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub enum CompilationStatus {
    Queued,
    Started,
    Succeeded,
    Failed,
    Dropped,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct CompilationJob {
    pub job_id: u64,
    pub kind: CompilationJobKind,
    pub priority: CompilationPriority,
    pub source_revision: SourceRevision,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct CompilationResult {
    pub job_id: u64,
    pub kind: CompilationJobKind,
    pub source_revision: SourceRevision,
    pub status: CompilationStatus,
    pub svgs: Option<Vec<String>>,
    pub preview_pages: Option<Vec<PreviewPageFile>>,
    pub export_path: Option<String>,
    pub diagnostics: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct PreviewPageFile {
    pub page_number: usize,
    pub path: String,
    #[serde(default)]
    pub changed: bool,
    pub content_hash: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct CompilationQueueSnapshot {
    pub latest_source_revision: SourceRevision,
    pub active_job_id: Option<u64>,
    pub queued_preview_job_id: Option<u64>,
    pub queued_export_count: usize,
    pub last_result: Option<CompilationResult>,
}

#[derive(Default)]
struct CompilationQueueInner {
    pending_preview: Option<CompilationJob>,
    pending_exports: VecDeque<CompilationJob>,
    active_job_id: Option<u64>,
    worker_running: bool,
    preview_has_started: bool,
    latest_source_revision: SourceRevision,
    last_result: Option<CompilationResult>,
    debounce: Duration,
}

pub struct CompilationQueue {
    inner: Mutex<CompilationQueueInner>,
    next_job_id: AtomicU64,
}

impl CompilationQueue {
    pub fn new() -> Self {
        Self::with_debounce(Duration::from_millis(DEFAULT_DEBOUNCE_MS))
    }

    fn with_debounce(debounce: Duration) -> Self {
        let inner = CompilationQueueInner {
            debounce,
            ..CompilationQueueInner::default()
        };
        Self {
            inner: Mutex::new(inner),
            next_job_id: AtomicU64::new(1),
        }
    }

    pub fn mark_source_revision(&self, source_revision: SourceRevision) {
        let mut inner = self.inner.lock();
        inner.latest_source_revision = source_revision;
    }

    pub fn enqueue_preview(&self, source_revision: SourceRevision) -> CompilationJob {
        let job = CompilationJob {
            job_id: self.next_job_id.fetch_add(1, Ordering::SeqCst),
            kind: CompilationJobKind::PreviewSvg,
            priority: CompilationPriority::Preview,
            source_revision,
        };

        let mut inner = self.inner.lock();
        inner.latest_source_revision = job.source_revision;
        inner.pending_preview = Some(job.clone());
        inner.last_result = Some(result_for_job(&job, CompilationStatus::Queued));
        job
    }

    pub fn set_debounce(&self, debounce: Duration) {
        self.inner.lock().debounce = debounce;
    }

    pub fn enqueue_export(&self, format: ExportFormat) -> CompilationJob {
        let source_revision = self.inner.lock().latest_source_revision;
        let job = CompilationJob {
            job_id: self.next_job_id.fetch_add(1, Ordering::SeqCst),
            kind: CompilationJobKind::Export { format },
            priority: CompilationPriority::Export,
            source_revision,
        };

        let mut inner = self.inner.lock();
        inner.pending_exports.push_back(job.clone());
        inner.last_result = Some(result_for_job(&job, CompilationStatus::Queued));
        job
    }

    pub fn snapshot(&self) -> CompilationQueueSnapshot {
        let inner = self.inner.lock();
        CompilationQueueSnapshot {
            latest_source_revision: inner.latest_source_revision,
            active_job_id: inner.active_job_id,
            queued_preview_job_id: inner.pending_preview.as_ref().map(|job| job.job_id),
            queued_export_count: inner.pending_exports.len(),
            last_result: inner.last_result.clone(),
        }
    }

    pub fn ensure_worker(
        self: &Arc<Self>,
        app: AppHandle,
        vfs: Arc<VirtualFileSystem>,
        document_session: Arc<DocumentSession>,
        preview_sync: Arc<PreviewSyncState>,
    ) {
        let should_spawn = {
            let mut inner = self.inner.lock();
            if inner.worker_running {
                false
            } else {
                inner.worker_running = true;
                true
            }
        };

        if should_spawn {
            let queue = Arc::clone(self);
            thread::spawn(move || queue.run_worker(app, vfs, document_session, preview_sync));
        }
    }

    fn run_worker(
        self: Arc<Self>,
        app: AppHandle,
        vfs: Arc<VirtualFileSystem>,
        document_session: Arc<DocumentSession>,
        preview_sync: Arc<PreviewSyncState>,
    ) {
        loop {
            if let Some(job) = self.take_debounced_preview_job() {
                self.run_job(&app, &vfs, &document_session, &preview_sync, job);
                continue;
            }

            if let Some(job) = self.take_export_job() {
                self.run_job(&app, &vfs, &document_session, &preview_sync, job);
                continue;
            }

            let should_stop = {
                let mut inner = self.inner.lock();
                if inner.pending_preview.is_none() && inner.pending_exports.is_empty() {
                    inner.worker_running = false;
                    true
                } else {
                    false
                }
            };

            if should_stop {
                return;
            }
        }
    }

    fn take_debounced_preview_job(&self) -> Option<CompilationJob> {
        let should_wait = {
            let inner = self.inner.lock();
            inner.pending_preview.as_ref()?;
            inner.preview_has_started.then_some(inner.debounce)
        };

        if let Some(debounce) = should_wait.filter(|duration| !duration.is_zero()) {
            thread::sleep(debounce);
        }

        let mut inner = self.inner.lock();
        let job = inner.pending_preview.take();
        if job.is_some() {
            inner.preview_has_started = true;
        }
        job
    }

    fn take_export_job(&self) -> Option<CompilationJob> {
        self.inner.lock().pending_exports.pop_front()
    }

    fn run_job(
        &self,
        app: &AppHandle,
        vfs: &Arc<VirtualFileSystem>,
        document_session: &DocumentSession,
        preview_sync: &PreviewSyncState,
        job: CompilationJob,
    ) {
        self.update_result(result_for_job(&job, CompilationStatus::Started));
        emit_compile_event(
            app,
            COMPILE_STARTED_EVENT,
            result_for_job(&job, CompilationStatus::Started),
        );

        let result = match &job.kind {
            CompilationJobKind::PreviewSvg => match compile_document(Arc::clone(vfs)) {
                Ok(document) => {
                    let svgs = render_svgs(&document);
                    if self.is_stale_preview(&job) {
                        result_for_job(&job, CompilationStatus::Dropped)
                    } else {
                        let preview_dir = ".ergproj/preview/svg";
                        let preview_pages = write_svg_pages(vfs, preview_dir, &svgs);
                        preview_sync.store_preview(
                            job.source_revision,
                            document,
                            document_session.status().source_map,
                        );
                        let mut result = result_for_job(&job, CompilationStatus::Succeeded);
                        result.svgs = Some(svgs);
                        result.preview_pages = Some(preview_pages);
                        result.export_path = Some(preview_dir.to_string());
                        result
                    }
                }
                Err(message) => {
                    if self.is_stale_preview(&job) {
                        result_for_job(&job, CompilationStatus::Dropped)
                    } else {
                        failed_result(&job, message)
                    }
                }
            },
            CompilationJobKind::Export { format } => run_export_job(vfs, &job, format),
        };

        let event_name = match result.status {
            CompilationStatus::Succeeded => COMPILE_SUCCEEDED_EVENT,
            CompilationStatus::Failed => COMPILE_FAILED_EVENT,
            CompilationStatus::Dropped => COMPILE_DROPPED_EVENT,
            CompilationStatus::Queued => COMPILE_QUEUED_EVENT,
            CompilationStatus::Started => COMPILE_STARTED_EVENT,
        };

        {
            let mut inner = self.inner.lock();
            inner.active_job_id = None;
        }
        self.update_result(result.clone());
        emit_compile_event(app, event_name, result);
    }

    fn is_stale_preview(&self, job: &CompilationJob) -> bool {
        let inner = self.inner.lock();
        job.kind == CompilationJobKind::PreviewSvg
            && job.source_revision != inner.latest_source_revision
    }

    fn update_result(&self, result: CompilationResult) {
        let mut inner = self.inner.lock();
        inner.active_job_id = match result.status {
            CompilationStatus::Started => Some(result.job_id),
            _ => None,
        };
        inner.last_result = Some(result);
    }
}

impl Default for CompilationQueue {
    fn default() -> Self {
        Self::new()
    }
}

fn result_for_job(job: &CompilationJob, status: CompilationStatus) -> CompilationResult {
    CompilationResult {
        job_id: job.job_id,
        kind: job.kind.clone(),
        source_revision: job.source_revision,
        status,
        svgs: None,
        preview_pages: None,
        export_path: None,
        diagnostics: Vec::new(),
    }
}

fn failed_result(job: &CompilationJob, message: String) -> CompilationResult {
    let mut result = result_for_job(job, CompilationStatus::Failed);
    result.diagnostics = vec![message];
    result
}

fn emit_compile_event(app: &AppHandle, event_name: &str, result: CompilationResult) {
    let _ = app.emit(event_name, result);
}

fn compile_document(vfs: Arc<VirtualFileSystem>) -> Result<PagedDocument, String> {
    let main_id = FileId::new(None, VirtualPath::new("main.typ"));
    let world = ErgoWorld::new(vfs, main_id);

    match typst::compile::<PagedDocument>(&world).output {
        Ok(document) => Ok(document),
        Err(errors) => Err(format!("{:?}", errors)),
    }
}

fn compile_svgs(vfs: Arc<VirtualFileSystem>) -> Result<Vec<String>, String> {
    let document = compile_document(vfs)?;
    Ok(render_svgs(&document))
}

fn render_svgs(document: &PagedDocument) -> Vec<String> {
    document.pages.iter().map(typst_svg::svg).collect()
}

fn write_svg_pages(
    vfs: &VirtualFileSystem,
    directory: &str,
    svgs: &[String],
) -> Vec<PreviewPageFile> {
    let mut changed_pages = Vec::with_capacity(svgs.len());
    for (index, svg) in svgs.iter().enumerate() {
        let path = format!("{}/page-{}.svg", directory, index + 1);
        let existing = vfs.read_source(&path).ok();
        let changed = existing.as_deref() != Some(svg.as_str());
        if changed {
            vfs.write_source(&path, svg.clone());
        }
        changed_pages.push(changed);
    }

    let mut stale_page_number = svgs.len() + 1;
    loop {
        let stale_path = format!("{}/page-{}.svg", directory, stale_page_number);
        if !vfs.has_file(&stale_path) {
            break;
        }
        vfs.remove_path(&stale_path);
        stale_page_number += 1;
    }

    (0..svgs.len())
        .map(|index| PreviewPageFile {
            changed: changed_pages[index],
            content_hash: hash_svg(&svgs[index]),
            page_number: index + 1,
            path: format!("{}/page-{}.svg", directory, index + 1),
        })
        .collect()
}

fn hash_svg(svg: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    svg.hash(&mut hasher);
    hasher.finish()
}

fn run_export_job(
    vfs: &Arc<VirtualFileSystem>,
    job: &CompilationJob,
    format: &ExportFormat,
) -> CompilationResult {
    match format {
        ExportFormat::Svg => match compile_svgs(Arc::clone(vfs)) {
            Ok(svgs) => {
                let export_dir = ".ergproj/exports/svg";
                write_svg_pages(vfs, export_dir, &svgs);

                let mut result = result_for_job(job, CompilationStatus::Succeeded);
                result.svgs = Some(svgs);
                result.export_path = Some(export_dir.to_string());
                result
            }
            Err(message) => failed_result(job, message),
        },
        ExportFormat::Pdf => match compile_document(Arc::clone(vfs)) {
            Ok(document) => match typst_pdf::pdf(&document, &typst_pdf::PdfOptions::default()) {
                Ok(bytes) => {
                    let export_path = ".ergproj/exports/document.pdf";
                    vfs.write_file(export_path, bytes);
                    let mut result = result_for_job(job, CompilationStatus::Succeeded);
                    result.export_path = Some(export_path.to_string());
                    result
                }
                Err(errors) => failed_result(job, format!("{:?}", errors)),
            },
            Err(message) => failed_result(job, message),
        },
        ExportFormat::Png => match compile_document(Arc::clone(vfs)) {
            Ok(document) => {
                let export_dir = ".ergproj/exports/png";
                for (index, page) in document.pages.iter().enumerate() {
                    let pixmap = typst_render::render(page, 2.0);
                    match pixmap.encode_png() {
                        Ok(bytes) => {
                            vfs.write_file(&format!("{}/page-{}.png", export_dir, index + 1), bytes)
                        }
                        Err(error) => return failed_result(job, error.to_string()),
                    }
                }

                let mut result = result_for_job(job, CompilationStatus::Succeeded);
                result.export_path = Some(export_dir.to_string());
                result
            }
            Err(message) => failed_result(job, message),
        },
    }
}

#[tauri::command]
pub fn write_source(
    state: State<'_, TauriAppState>,
    path: String,
    text: String,
) -> Result<(), String> {
    state.vfs.write_source(&path, text);
    state
        .compilation_queue
        .mark_source_revision(state.vfs.latest_revision());
    Ok(())
}

#[tauri::command]
pub fn patch_source(
    state: State<'_, TauriAppState>,
    path: String,
    start: usize,
    end: usize,
    text: String,
) -> Result<(), String> {
    state.vfs.apply_patch(&path, start, end, &text)?;
    state
        .compilation_queue
        .mark_source_revision(state.vfs.latest_revision());
    Ok(())
}

#[tauri::command]
pub fn trigger_compile(state: State<'_, TauriAppState>) -> Result<Vec<String>, String> {
    compile_svgs(state.vfs.clone())
}

#[tauri::command]
pub fn enqueue_preview_compile(
    app: AppHandle,
    state: State<'_, TauriAppState>,
    debounce_ms: Option<usize>,
) -> Result<CompilationJob, String> {
    state
        .compilation_queue
        .set_debounce(Duration::from_millis(debounce_ms.unwrap_or(0) as u64));
    let source_revision = state
        .document_session
        .status()
        .source_revision
        .max(state.vfs.latest_revision());
    let job = state.compilation_queue.enqueue_preview(source_revision);
    emit_compile_event(
        &app,
        COMPILE_QUEUED_EVENT,
        result_for_job(&job, CompilationStatus::Queued),
    );
    state.compilation_queue.ensure_worker(
        app,
        state.vfs.clone(),
        state.document_session.clone(),
        state.preview_sync.clone(),
    );
    Ok(job)
}

#[tauri::command]
pub fn enqueue_export(
    app: AppHandle,
    state: State<'_, TauriAppState>,
    format: ExportFormat,
) -> Result<CompilationJob, String> {
    let job = state.compilation_queue.enqueue_export(format);
    emit_compile_event(
        &app,
        COMPILE_QUEUED_EVENT,
        result_for_job(&job, CompilationStatus::Queued),
    );
    state.compilation_queue.ensure_worker(
        app,
        state.vfs.clone(),
        state.document_session.clone(),
        state.preview_sync.clone(),
    );
    Ok(job)
}

#[tauri::command]
pub fn get_compile_status(
    state: State<'_, TauriAppState>,
) -> Result<CompilationQueueSnapshot, String> {
    Ok(state.compilation_queue.snapshot())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::{
        ContentSection, CoverPageSection, DependencyManifest, DocumentAST, DocumentElement,
        DocumentSection, GlobalSettings, Heading, ProjectMetadata, ProjectSettings, RichText,
    };

    #[test]
    fn dedupes_preview_jobs_to_latest_revision() {
        let queue = CompilationQueue::with_debounce(Duration::from_millis(0));

        let first = queue.enqueue_preview(1);
        let second = queue.enqueue_preview(2);

        let job = queue.take_debounced_preview_job().unwrap();

        assert!(second.source_revision > first.source_revision);
        assert_eq!(job.job_id, second.job_id);
        assert!(queue.take_debounced_preview_job().is_none());
    }

    #[test]
    fn prioritizes_preview_jobs_before_exports() {
        let queue = CompilationQueue::with_debounce(Duration::from_millis(0));

        queue.mark_source_revision(1);
        let export = queue.enqueue_export(ExportFormat::Svg);
        let preview = queue.enqueue_preview(2);

        assert_eq!(
            queue.take_debounced_preview_job().unwrap().job_id,
            preview.job_id
        );
        assert_eq!(queue.take_export_job().unwrap().job_id, export.job_id);
    }

    #[test]
    fn detects_stale_preview_jobs() {
        let queue = CompilationQueue::with_debounce(Duration::from_millis(0));

        let first = queue.enqueue_preview(1);
        let second = queue.enqueue_preview(2);

        assert!(queue.is_stale_preview(&first));
        assert!(!queue.is_stale_preview(&second));
    }

    #[test]
    fn snapshots_pending_work() {
        let queue = CompilationQueue::with_debounce(Duration::from_millis(0));

        let preview = queue.enqueue_preview(1);
        queue.enqueue_export(ExportFormat::Svg);

        let snapshot = queue.snapshot();

        assert_eq!(snapshot.latest_source_revision, preview.source_revision);
        assert_eq!(snapshot.queued_preview_job_id, Some(preview.job_id));
        assert_eq!(snapshot.queued_export_count, 1);
    }

    #[test]
    fn compiles_svg_from_multifile_vfs_sources() {
        let vfs = Arc::new(VirtualFileSystem::new());
        vfs.write_source(
            "main.typ",
            "#set page(paper: \"us-letter\")\n#include \"sections/content.typ\"\n".to_string(),
        );
        vfs.write_source(
            "sections/content.typ",
            "= Título\n\nTexto con ñ.\n".to_string(),
        );

        let svgs = compile_svgs(vfs).unwrap();

        assert!(!svgs.is_empty());
        assert!(svgs[0].contains("<svg"));
    }

    #[test]
    fn compiles_svg_from_document_session_sources() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        session.sync_snapshot(test_ast()).unwrap();

        let svgs = compile_svgs(vfs).unwrap();

        assert!(!svgs.is_empty());
        assert!(svgs[0].contains("<svg"));
    }

    #[test]
    fn writes_preview_svg_pages_to_vfs_files() {
        let vfs = VirtualFileSystem::new();

        let pages = write_svg_pages(
            &vfs,
            ".ergproj/preview/svg",
            &["<svg>uno</svg>".to_string(), "<svg>dos</svg>".to_string()],
        );

        assert_eq!(
            pages,
            vec![
                PreviewPageFile {
                    changed: true,
                    content_hash: hash_svg("<svg>uno</svg>"),
                    page_number: 1,
                    path: ".ergproj/preview/svg/page-1.svg".to_string(),
                },
                PreviewPageFile {
                    changed: true,
                    content_hash: hash_svg("<svg>dos</svg>"),
                    page_number: 2,
                    path: ".ergproj/preview/svg/page-2.svg".to_string(),
                },
            ]
        );
        assert_eq!(
            vfs.read_source(".ergproj/preview/svg/page-1.svg").unwrap(),
            "<svg>uno</svg>"
        );
        assert_eq!(
            vfs.read_source(".ergproj/preview/svg/page-2.svg").unwrap(),
            "<svg>dos</svg>"
        );
    }

    #[test]
    fn marks_only_changed_preview_svg_pages() {
        let vfs = VirtualFileSystem::new();

        write_svg_pages(
            &vfs,
            ".ergproj/preview/svg",
            &["<svg>uno</svg>".to_string(), "<svg>dos</svg>".to_string()],
        );
        let pages = write_svg_pages(
            &vfs,
            ".ergproj/preview/svg",
            &["<svg>uno</svg>".to_string(), "<svg>tres</svg>".to_string()],
        );

        assert_eq!(pages[0].changed, false);
        assert_eq!(pages[1].changed, true);
        assert_eq!(pages[0].content_hash, hash_svg("<svg>uno</svg>"));
        assert_eq!(pages[1].content_hash, hash_svg("<svg>tres</svg>"));
    }

    fn test_ast() -> DocumentAST {
        DocumentAST {
            version: "1.0".to_string(),
            metadata: ProjectMetadata {
                template_id: "apa7".to_string(),
                title: "Título con ñ".to_string(),
                project_settings: ProjectSettings::default(),
                local_overrides: GlobalSettings::default(),
            },
            dependencies: DependencyManifest { packages: vec![] },
            references: vec![],
            assets: vec![],
            sections: vec![
                DocumentSection::CoverPage(CoverPageSection {
                    id: "cover-section".to_string(),
                    is_optional: true,
                    authors: vec![],
                    affiliations: vec![],
                    abstract_text: "Resumen breve.".to_string(),
                }),
                DocumentSection::Content(ContentSection {
                    id: "content-section".to_string(),
                    is_optional: false,
                    elements: vec![DocumentElement::Heading(Heading {
                        id: "heading-1".to_string(),
                        level: 2,
                        content: vec![RichText {
                            text: "Introducción".to_string(),
                            bold: None,
                            italic: None,
                            kind: None,
                            reference_id: None,
                            equation_source: None,
                        }],
                    })],
                }),
            ],
        }
    }
}
