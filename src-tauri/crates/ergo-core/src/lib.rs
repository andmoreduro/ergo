pub mod ast;
pub mod bundled_templates;
pub mod compilation_types;
pub mod compile_artifacts;
pub mod core_errors;
pub mod document_outline;
pub mod document_resources;
pub mod document_session;
pub mod document_session_events;
pub mod document_session_generation;
pub mod document_session_types;
pub mod document_source_builder;
#[cfg(not(target_arch = "wasm32"))]
pub mod font_loader;
pub mod font_availability;
pub mod font_requirements;
pub mod generated_assets;
pub mod package_resolver;
pub mod path_utils;
pub mod preview_pipeline;
pub mod preview_sync;
pub mod preview_sync_lookup;
pub mod preview_sync_types;
pub mod quote_policy;
mod required_input_fallback;
pub mod resource_watch;
pub mod settings;
pub mod template_spec;
pub mod test_fixtures;
mod typst_source;
pub mod vfs;
pub mod world;

/// Canonical BibLaTeX export for the app's bibliography export command. The
/// same normalization the compiled in-VFS `references.bib` receives, so an
/// exported file parses wherever the in-app compile does.
pub fn generate_references_bib(references: &[ast::ReferenceEntry]) -> String {
    typst_source::generate_references_bib(references)
}
