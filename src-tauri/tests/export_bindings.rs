use std::path::PathBuf;

use ts_rs::{Config, TS};

#[test]
fn export_typescript_bindings() {
    let out_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri should have a repository root parent")
        .join("src")
        .join("bindings");
    let config = Config::default().with_out_dir(out_dir);

    ergo_lib::action_types::ActionDescriptor::export_all(&config).unwrap();
    ergo_lib::action_types::ContextDescriptor::export_all(&config).unwrap();
    ergo_lib::action_types::ActionResolution::export_all(&config).unwrap();
    ergo_lib::archive::OpenProjectResult::export_all(&config).unwrap();
    ergo_lib::ast::DocumentAST::export_all(&config).unwrap();
    ergo_core::settings::GlobalSettings::export_all(&config).unwrap();
    ergo_core::settings::KeymapProfileRecord::export_all(&config).unwrap();
    ergo_core::settings::KeymapSettings::export_all(&config).unwrap();
    ergo_lib::compilation_types::CompilationResult::export_all(&config).unwrap();
    ergo_lib::compilation_types::ExportFormat::export_all(&config).unwrap();
    ergo_lib::core_errors::ErgoError::export_all(&config).unwrap();
    ergo_lib::document_outline::DocumentOutline::export_all(&config).unwrap();
    ergo_lib::document_resources::DocumentResources::export_all(&config).unwrap();
    ergo_lib::document_session_types::DocumentEvent::export_all(&config).unwrap();
    ergo_lib::document_session_types::DocumentSessionStatus::export_all(&config).unwrap();
    ergo_lib::font_availability::FontAvailability::export_all(&config).unwrap();
    ergo_lib::font_availability::ProjectFontAvailability::export_all(&config).unwrap();
    ergo_lib::preview_sync_types::PreviewElementPositionsResult::export_all(&config).unwrap();
    ergo_lib::preview_sync_types::PreviewJumpResult::export_all(&config).unwrap();
    ergo_lib::template_spec::TemplateSpec::export_all(&config).unwrap();
    ergo_lib::translation_server::TranslationServerStatus::export_all(&config).unwrap();
    ergo_lib::translation_server::BibliographyLookupOutcome::export_all(&config).unwrap();
    ergo_lib::settings::GlobalSettingsSaveReport::export_all(&config).unwrap();
    ergo_lib::perf_commands::PerfHarnessReport::export_all(&config).unwrap();
    ergo_lib::perf_commands::PerfOneShotTiming::export_all(&config).unwrap();
    ergo_lib::perf_commands::PerfTypingTarget::export_all(&config).unwrap();
    ergo_lib::perf_commands::BootstrapPhaseTimings::export_all(&config).unwrap();
}
