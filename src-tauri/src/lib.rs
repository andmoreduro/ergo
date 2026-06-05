fn apply_window_icons(
    app: &tauri::App,
    window: &tauri::WebviewWindow,
) {
    let icon = app
        .default_window_icon()
        .cloned()
        .unwrap_or_else(|| tauri::include_image!("icons/32x32.png"));

    let _ = window.set_icon(icon);
}

#[cfg(windows)]
fn disable_windows_default_context_menu(webview: tauri::webview::PlatformWebview) {
    let _ = unsafe {
        webview
            .controller()
            .CoreWebView2()
            .and_then(|core| core.Settings())
            .map(|settings| settings.SetAreDefaultContextMenusEnabled(false))
    };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Manager;
    let vfs = std::sync::Arc::new(vfs::VirtualFileSystem::new());
    let document_session = std::sync::Arc::new(document_session::DocumentSession::new(
        std::sync::Arc::clone(&vfs),
    ));
    let state = app_state::TauriAppState {
        vfs: std::sync::Arc::clone(&vfs),
        document_session,
    };

    let protocol_vfs = std::sync::Arc::clone(&vfs);
    tauri::Builder::default()
        .register_uri_scheme_protocol("ergo-preview", move |_ctx, request| {
            let path = request.uri().path();
            let relative_path = path.strip_prefix('/').unwrap_or(path);

            match protocol_vfs.read_file(relative_path) {
                Ok(bytes) => {
                    let content_type = if relative_path.ends_with(".svg") {
                        "image/svg+xml"
                    } else if relative_path.ends_with(".png") {
                        "image/png"
                    } else {
                        "application/octet-stream"
                    };

                    tauri::http::Response::builder()
                        .status(200)
                        .header("Content-Type", content_type)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(bytes)
                        .unwrap()
                }
                Err(_) => tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap(),
            }
        })
        .manage(state)
        .manage(actions::ActionResolverState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let resource_templates = app.path().resource_dir().unwrap().join("resources/templates");
            ergo_core::template_spec::set_templates_dir(resource_templates);

            let custom_templates = app.path().app_data_dir().unwrap().join("templates");
            ergo_core::template_spec::set_custom_templates_dir(custom_templates);

            if let Some(window) = app.get_webview_window("main") {
                apply_window_icons(app, &window);
                #[cfg(windows)]
                let _ = window.with_webview(disable_windows_default_context_menu);
            }

            settings::ensure_translation_server_if_enabled(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            actions_commands::get_action_catalog,
            actions_commands::get_context_glossary,
            actions_commands::resolve_key_event,
            actions_commands::reset_key_sequence,
            actions_commands::validate_keymap_settings,
            compiler::write_bytes_to_path,
            compiler::write_zip_export,
            compiler::load_fonts_for_families,
            compiler::load_fonts_for_document,
            compiler::check_project_fonts,
            compiler::resolve_project_fonts,
            compiler::list_system_font_families,
            compiler::write_source,
            compiler::patch_source,
            compiler::open_devtools,
            document_session_commands::sync_document_snapshot,
            document_session_commands::sync_document_event,
            document_session_commands::sync_document_events,
            document_session_commands::get_document_session_status,
            document_session_commands::reset_project_session,
            document_session_commands::import_resource_file,
            document_session_commands::import_resource_bytes,
            document_session_commands::read_vfs_file,
            document_session_commands::write_generated_asset,
            settings::load_global_settings,
            settings::save_global_settings,
            settings::get_translation_server_status,
            translation_server::lookup_bibliography_metadata,
            settings::load_keymap_settings,
            settings::save_keymap_settings,
            settings::get_template_spec,
            archive::save_project,
            archive::open_project,
            archive::load_template_package_files,
            archive::load_package_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
pub mod action_catalog;
pub mod context_glossary;
pub mod action_context;
pub mod action_keymap;
pub mod action_types;
pub mod actions;
pub mod actions_commands;
pub mod app_state;
pub mod archive;
pub mod compile_events;
pub mod compiler;
pub mod document_session_commands;
pub mod package_download;
pub mod settings;
pub mod translation_server;
#[cfg(test)]
pub use ergo_core::test_fixtures;
pub use ergo_core::{
    ast, compilation_types, compile_artifacts, core_errors, document_outline, document_resources,
    document_session, document_session_events, document_session_generation, document_session_types,
    document_source_builder, font_availability, font_loader, font_requirements, generated_assets,
    package_resolver, path_utils,
    preview_pipeline, preview_sync, preview_sync_lookup, preview_sync_types, resource_watch,
    template_spec, vfs, world,
};
