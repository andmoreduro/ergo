#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let vfs = std::sync::Arc::new(vfs::VirtualFileSystem::new());
    let compilation_queue = std::sync::Arc::new(compiler::CompilationQueue::new());
    let document_session = std::sync::Arc::new(document_session::DocumentSession::new(
        std::sync::Arc::clone(&vfs),
    ));
    let state = compiler::TauriAppState {
        vfs,
        compilation_queue,
        document_session,
    };

    tauri::Builder::default()
        .manage(state)
        .manage(actions::ActionResolverState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            actions::get_action_catalog,
            actions::resolve_key_event,
            actions::reset_key_sequence,
            actions::validate_keymap_settings,
            compiler::write_source,
            compiler::patch_source,
            compiler::trigger_compile,
            compiler::enqueue_preview_compile,
            compiler::enqueue_export,
            compiler::get_compile_status,
            document_session::sync_document_snapshot,
            document_session::sync_document_event,
            document_session::get_document_session_status,
            document_session::read_preview_svg,
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
pub mod actions;
pub mod archive;
pub mod ast;
pub mod compiler;
pub mod document_session;
pub mod settings;
pub mod vfs;
pub mod world;
