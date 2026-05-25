#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    #[test]
    fn core_modules_do_not_depend_on_tauri_command_state() {
        let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
        let src_dir = manifest_dir.join("src");
        let core_src_dir = manifest_dir.join("crates/ergo-core/src");

        let paths = vec![
            src_dir.join("actions.rs"),
            core_src_dir.join("document_session.rs"),
            core_src_dir.join("preview_sync.rs"),
        ];

        for path in paths {
            let filename = path.file_name().unwrap().to_string_lossy();
            let source = fs::read_to_string(&path)
                .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()));

            assert!(
                !source.contains("TauriAppState")
                    && !source.contains("tauri::State")
                    && !source.contains("tauri::AppHandle")
                    && !source.contains("#[tauri::command]"),
                "{filename} must keep Tauri command state in command adapter modules",
            );
        }
    }

    #[test]
    fn document_session_commands_do_not_compile_on_sync_path() {
        let source_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let source = fs::read_to_string(source_dir.join("document_session_commands.rs"))
            .unwrap_or_else(|error| panic!("failed to read document_session_commands.rs: {error}"));

        assert!(
            !source.contains("compile_document"),
            "document_session_commands must not compile Typst on the sync IPC path",
        );
    }
}
