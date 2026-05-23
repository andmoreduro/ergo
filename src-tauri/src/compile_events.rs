use tauri::{AppHandle, Emitter};

use crate::compilation_types::CompilationResult;

pub const COMPILE_STARTED_EVENT: &str = "ergo-compile-started";
pub const COMPILE_SUCCEEDED_EVENT: &str = "ergo-compile-succeeded";
pub const COMPILE_FAILED_EVENT: &str = "ergo-compile-failed";
pub const RESOURCES_UPDATED_EVENT: &str = "ergo-resources-updated";

pub(crate) fn emit_compile_event(app: &AppHandle, event_name: &str, result: CompilationResult) {
    let _ = app.emit(event_name, result);
}
