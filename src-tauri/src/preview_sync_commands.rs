use tauri::State;

use crate::app_state::TauriAppState;
use crate::compilation_types::SourceRevision;
use crate::preview_sync::{
    PreviewElementPositionsResult, PreviewFocusTarget, PreviewJumpResult, PreviewSyncStatus,
};

#[tauri::command]
pub fn jump_from_preview_click(
    state: State<'_, TauriAppState>,
    page_number: usize,
    x_pt: f64,
    y_pt: f64,
    source_revision: SourceRevision,
) -> Result<PreviewJumpResult, String> {
    Ok(state
        .preview_sync
        .jump_from_click(page_number, x_pt, y_pt, source_revision))
}

#[tauri::command]
pub fn get_preview_positions_for_element(
    state: State<'_, TauriAppState>,
    element_id: String,
    source_revision: SourceRevision,
) -> Result<PreviewElementPositionsResult, String> {
    Ok(state
        .preview_sync
        .positions_for_element(&element_id, source_revision))
}

#[tauri::command]
pub fn get_preview_positions_for_focus(
    state: State<'_, TauriAppState>,
    target: PreviewFocusTarget,
    source_revision: SourceRevision,
) -> Result<PreviewElementPositionsResult, String> {
    Ok(state
        .preview_sync
        .positions_for_focus(&target, source_revision))
}

#[tauri::command]
pub fn get_preview_sync_status(
    state: State<'_, TauriAppState>,
) -> Result<PreviewSyncStatus, String> {
    Ok(state.preview_sync.status())
}
