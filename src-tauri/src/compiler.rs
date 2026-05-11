use std::time::Duration;

use tauri::{AppHandle, State};

use crate::app_state::TauriAppState;
pub use crate::compilation_queue::CompilationQueue;
pub use crate::compilation_types::{
    CompilationJob, CompilationJobKind, CompilationPriority, CompilationQueueSnapshot,
    CompilationResult, CompilationStatus, ExportFormat, PreviewPageFile, SourceRevision,
};
use crate::compile_artifacts::result_for_job;
use crate::compile_events::{emit_compile_event, COMPILE_QUEUED_EVENT};

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
