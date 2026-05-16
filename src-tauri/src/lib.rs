#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let vfs = std::sync::Arc::new(vfs::VirtualFileSystem::new());
    let compilation_queue = std::sync::Arc::new(compilation_queue::CompilationQueue::new());
    let document_session = std::sync::Arc::new(document_session::DocumentSession::new(
        std::sync::Arc::clone(&vfs),
    ));
    let preview_sync = std::sync::Arc::new(preview_sync::PreviewSyncState::default());
    let state = app_state::TauriAppState {
        vfs,
        compilation_queue,
        document_session,
        preview_sync,
    };

    tauri::Builder::default()
        .manage(state)
        .manage(actions::ActionResolverState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            actions_commands::get_action_catalog,
            actions_commands::resolve_key_event,
            actions_commands::reset_key_sequence,
            actions_commands::validate_keymap_settings,
            compiler::write_source,
            compiler::patch_source,
            compiler::enqueue_preview_compile,
            compiler::enqueue_export,
            compiler::get_compile_status,
            document_session_commands::sync_document_snapshot,
            document_session_commands::sync_document_event,
            document_session_commands::get_document_session_status,
            document_session_commands::read_preview_svg,
            preview_sync_commands::jump_from_preview_click,
            preview_sync_commands::get_preview_positions_for_element,
            preview_sync_commands::get_preview_positions_for_focus,
            preview_sync_commands::get_preview_sync_status,
            settings::load_global_settings,
            settings::save_global_settings,
            settings::load_keymap_settings,
            settings::save_keymap_settings,
            archive::save_project,
            archive::open_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
pub mod action_catalog;
pub mod action_context;
pub mod action_keymap;
pub mod action_types;
pub mod actions;
pub mod actions_commands;
pub mod app_state;
pub mod archive;
pub mod ast;
pub mod backend_profile;
pub mod compilation_queue;
pub mod compilation_types;
pub mod compile_artifacts;
pub mod compile_events;
pub mod compiler;
pub mod core_errors;
pub mod document_session_commands;
pub mod document_source_builder;
pub mod document_session_events;
pub mod document_session_generation;
pub mod document_session;
pub mod document_session_types;
pub mod path_utils;
pub mod preview_sync_commands;
pub mod preview_sync_lookup;
pub mod preview_sync;
pub mod preview_sync_types;
pub mod settings;
#[cfg(test)]
mod architecture_tests;
#[cfg(test)]
pub mod test_fixtures;
pub mod vfs;
pub mod world;
