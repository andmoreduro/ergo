use tauri::{AppHandle, Emitter};

use crate::compilation_types::CompilationResult;

pub const COMPILE_QUEUED_EVENT: &str = "ergo-compile-queued";
pub const COMPILE_STARTED_EVENT: &str = "ergo-compile-started";
pub const COMPILE_SUCCEEDED_EVENT: &str = "ergo-compile-succeeded";
pub const COMPILE_FAILED_EVENT: &str = "ergo-compile-failed";
pub const COMPILE_DROPPED_EVENT: &str = "ergo-compile-dropped";

pub(crate) fn emit_compile_event(app: &AppHandle, event_name: &str, result: CompilationResult) {
    let _ = app.emit(event_name, result);
}
