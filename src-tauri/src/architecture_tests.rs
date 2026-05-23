#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    const CORE_MODULES: [&str; 3] = ["actions.rs", "document_session.rs", "preview_sync.rs"];

    #[test]
    fn core_modules_do_not_depend_on_tauri_command_state() {
        let source_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");

        for module in CORE_MODULES {
            let source = fs::read_to_string(source_dir.join(module))
                .unwrap_or_else(|error| panic!("failed to read {module}: {error}"));

            assert!(
                !source.contains("TauriAppState")
                    && !source.contains("tauri::State")
                    && !source.contains("tauri::AppHandle")
                    && !source.contains("#[tauri::command]"),
                "{module} must keep Tauri command state in command adapter modules",
            );
        }
    }

    #[test]
    fn document_session_commands_do_not_compile_on_sync_path() {
        let source_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let source = fs::read_to_string(source_dir.join("document_session_commands.rs"))
            .unwrap_or_else(|error| {
                panic!("failed to read document_session_commands.rs: {error}")
            });

        assert!(
            !source.contains("compile_document"),
            "document_session_commands must not compile Typst on the sync IPC path",
        );
    }
}
