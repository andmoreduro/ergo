use tauri::{AppHandle, State};

use crate::actions::{
    action_catalog, resolve_key_event_with_settings, validate_keymap, ActionContextSnapshot,
    ActionDescriptor, ActionResolution, ActionResolverState, KeymapValidationResult,
    LogicalKeyEvent,
};
use crate::ast::KeymapSettings;

#[tauri::command]
pub fn get_action_catalog() -> Vec<ActionDescriptor> {
    action_catalog()
}

#[tauri::command]
pub fn reset_key_sequence(window_id: String, state: State<'_, ActionResolverState>) {
    state.clear_pending_sequence(&window_id);
}

#[tauri::command]
pub fn validate_keymap_settings(settings: KeymapSettings) -> KeymapValidationResult {
    validate_keymap(&settings)
}

#[tauri::command]
pub fn resolve_key_event(
    app: AppHandle,
    state: State<'_, ActionResolverState>,
    event: LogicalKeyEvent,
    context_snapshot: ActionContextSnapshot,
) -> Result<ActionResolution, String> {
    let settings = {
        if let Some(cached) = state.cached_keymap() {
            cached
        } else {
            let loaded = crate::settings::load_keymap_settings(app)?;
            state.cache_keymap(loaded.clone());
            loaded
        }
    };
    Ok(resolve_key_event_with_settings(
        &state,
        &settings,
        event,
        context_snapshot,
    ))
}
