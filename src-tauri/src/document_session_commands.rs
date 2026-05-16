use tauri::State;

use crate::app_state::TauriAppState;
use crate::ast::DocumentAST;
use crate::document_session::{
    read_preview_svg_from_vfs, DocumentEvent, DocumentSessionStatus,
};

#[tauri::command]
pub fn sync_document_snapshot(
    state: State<'_, TauriAppState>,
    ast: DocumentAST,
) -> Result<DocumentSessionStatus, String> {
    let status = state.document_session.sync_snapshot(ast)?;
    state
        .compilation_queue
        .mark_source_revision(status.source_revision);
    Ok(status)
}

#[tauri::command]
pub fn sync_document_event(
    state: State<'_, TauriAppState>,
    event: DocumentEvent,
) -> Result<DocumentSessionStatus, String> {
    let status = state.document_session.apply_event(event)?;
    state
        .compilation_queue
        .mark_source_revision(status.source_revision);
    Ok(status)
}

#[tauri::command]
pub fn get_document_session_status(
    state: State<'_, TauriAppState>,
) -> Result<DocumentSessionStatus, String> {
    Ok(state.document_session.status())
}

#[tauri::command]
pub fn read_preview_svg(state: State<'_, TauriAppState>, path: String) -> Result<String, String> {
    read_preview_svg_from_vfs(&state.vfs, &path).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vfs::VirtualFileSystem;

    #[test]
    fn preview_svg_core_errors_convert_to_ipc_strings() {
        let vfs = VirtualFileSystem::new();
        let result = read_preview_svg_from_vfs(&vfs, "main.typ")
            .map_err(|error| error.to_string());

        assert_eq!(
            result,
            Err("Preview SVG path must be inside .ergproj/preview/svg".to_string()),
        );
    }
}
