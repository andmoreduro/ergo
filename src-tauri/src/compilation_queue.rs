use parking_lot::{Condvar, Mutex};
use std::collections::VecDeque;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc,
};
use std::thread;
use std::time::Duration;
use tauri::AppHandle;

use crate::compilation_types::{
    CompilationJob, CompilationJobKind, CompilationPriority, CompilationQueueSnapshot,
    CompilationResult, CompilationStatus, ExportFormat, SourceRevision,
};
use crate::compile_artifacts::{
    compile_document_snapshot, failed_result, render_svgs_incremental, result_for_job,
    run_export_job, write_svg_pages, SvgPageCache,
};
use crate::compile_events::{
    emit_compile_event, COMPILE_DROPPED_EVENT, COMPILE_FAILED_EVENT, COMPILE_QUEUED_EVENT,
    COMPILE_STARTED_EVENT, COMPILE_SUCCEEDED_EVENT,
};
use crate::document_session::DocumentSession;
use crate::preview_sync::PreviewSyncState;
use crate::vfs::VirtualFileSystem;

const DEFAULT_DEBOUNCE_MS: u64 = 0;

#[derive(Default)]
struct CompilationQueueInner {
    pending_preview: Option<CompilationJob>,
    pending_exports: VecDeque<CompilationJob>,
    active_job_id: Option<u64>,
    preview_has_started: bool,
    latest_source_revision: SourceRevision,
    last_result: Option<CompilationResult>,
    debounce: Duration,
}

pub struct CompilationQueue {
    inner: Mutex<CompilationQueueInner>,
    condvar: Condvar,
    next_job_id: AtomicU64,
    worker_spawned: AtomicBool,
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
            condvar: Condvar::new(),
            next_job_id: AtomicU64::new(1),
            worker_spawned: AtomicBool::new(false),
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
        self.condvar.notify_one();
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
        self.condvar.notify_one();
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
        if !self.worker_spawned.swap(true, Ordering::SeqCst) {
            let queue = Arc::clone(self);
            thread::spawn(move || queue.run_worker(app, vfs, document_session, preview_sync));
        } else {
            self.condvar.notify_one();
        }
    }

    fn run_worker(
        self: Arc<Self>,
        app: AppHandle,
        vfs: Arc<VirtualFileSystem>,
        document_session: Arc<DocumentSession>,
        preview_sync: Arc<PreviewSyncState>,
    ) {
        let mut svg_cache = SvgPageCache::new();
        loop {
            // Wait for work if none is available
            {
                let mut inner = self.inner.lock();
                while inner.pending_preview.is_none() && inner.pending_exports.is_empty() {
                    self.condvar.wait(&mut inner);
                }
            }

            if let Some(job) = self.take_debounced_preview_job() {
                self.run_job(&app, &vfs, &document_session, &preview_sync, job, &mut svg_cache);
                continue;
            }

            if let Some(job) = self.take_export_job() {
                self.run_job(&app, &vfs, &document_session, &preview_sync, job, &mut svg_cache);
                continue;
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
        svg_cache: &mut SvgPageCache,
    ) {
        self.update_result(result_for_job(&job, CompilationStatus::Started));
        emit_compile_event(
            app,
            COMPILE_STARTED_EVENT,
            result_for_job(&job, CompilationStatus::Started),
        );

        let result = match &job.kind {
            CompilationJobKind::PreviewSvg => match compile_document_snapshot(vfs) {
                Ok((document, source_snapshot)) => {
                    let svgs = render_svgs_incremental(&document, svg_cache);
                    let document_status = document_session.status();
                    if self.is_stale_preview(&job)
                        || document_status.source_revision != job.source_revision
                    {
                        result_for_job(&job, CompilationStatus::Dropped)
                    } else {
                        let preview_dir = ".ergproj/preview/svg";
                        let preview_pages = write_svg_pages(vfs, preview_dir, &svgs);
                        preview_sync.store_preview(
                            job.source_revision,
                            document,
                            document_status.source_map,
                            document_status.field_source_map,
                            source_snapshot,
                        );
                        let mut result = result_for_job(&job, CompilationStatus::Succeeded);
                        result.preview_pages = Some(preview_pages);
                        result.export_path = Some(preview_dir.to_string());
                        result
                    }
                }
                Err(message) => {
                    if self.is_stale_preview(&job) {
                        result_for_job(&job, CompilationStatus::Dropped)
                    } else {
                        failed_result(&job, message.to_string())
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

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;

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
}
