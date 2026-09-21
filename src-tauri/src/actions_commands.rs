use tauri::{AppHandle, State};

use ergo_core::core_errors::ErgoError;

use crate::actions::{
    action_availability_with_settings, action_catalog, context_glossary,
    resolve_key_event_with_settings, validate_keymap, ActionAvailability, ActionContextSnapshot,
    ActionDescriptor, ActionResolution, ActionResolverState, ContextDescriptor,
    KeymapValidationResult, LogicalKeyEvent,
};
use ergo_core::settings::KeymapSettings;

#[tauri::command]
pub fn get_context_glossary() -> Vec<ContextDescriptor> {
    context_glossary()
}

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

fn cached_or_loaded_keymap(
    app: &AppHandle,
    state: &ActionResolverState,
) -> Result<KeymapSettings, ErgoError> {
    if let Some(cached) = state.cached_keymap() {
        return Ok(cached);
    }
    let loaded = crate::settings::load_keymap_settings(app.clone())?;
    state.cache_keymap(loaded.clone());
    Ok(loaded)
}

/// Availability of every catalog action for `context_snapshot` (see
/// `action_availability_with_settings`). The command palette filters on it.
#[tauri::command]
pub fn list_action_availability(
    app: AppHandle,
    state: State<'_, ActionResolverState>,
    context_snapshot: ActionContextSnapshot,
) -> Result<Vec<ActionAvailability>, ErgoError> {
    let settings = cached_or_loaded_keymap(&app, &state)?;
    Ok(action_availability_with_settings(&settings, &context_snapshot))
}

#[tauri::command]
pub fn resolve_key_event(
    app: AppHandle,
    state: State<'_, ActionResolverState>,
    event: LogicalKeyEvent,
    context_snapshot: ActionContextSnapshot,
) -> Result<ActionResolution, ErgoError> {
    let settings = cached_or_loaded_keymap(&app, &state)?;
    Ok(resolve_key_event_with_settings(
        &state,
        &settings,
        event,
        context_snapshot,
    ))
}
