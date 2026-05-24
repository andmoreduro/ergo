use typst::layout::PagedDocument;

use crate::ast::DocumentAST;
use crate::compilation_types::PreviewPageFile;
use crate::compile_artifacts::compile_document;
use crate::core_errors::CompileError;
use crate::document_outline::extract_outline;
use crate::document_resources::DocumentResources;
use crate::document_session::DocumentSession;
use crate::document_session_types::DocumentEvent;
use crate::resource_watch;
use crate::template_spec::{load_bundled_template, TemplateSpec};
use crate::vfs::VirtualFileSystem;
use crate::world::ErgoWorld;

/// Output of a successful main-document preview compile (canvas path).
pub struct PreviewCompileSuccess {
    pub document: PagedDocument,
    pub outline: crate::document_outline::DocumentOutline,
    pub preview_pages: Vec<PreviewPageFile>,
    pub resources: Option<DocumentResources>,
}

pub fn canvas_preview_pages(page_count: usize) -> Vec<PreviewPageFile> {
    (1..=page_count)
        .map(|page_number| PreviewPageFile {
            page_number,
            path: format!("page-{page_number}"),
            changed: true,
            content: None,
        })
        .collect()
}

pub fn build_preview_resources(
    vfs: &VirtualFileSystem,
    ast: &DocumentAST,
    template: &TemplateSpec,
) -> DocumentResources {
    let lib_source = crate::document_resources::resource_preview_lib_source(ast, template);
    resource_watch::write_resource_files(vfs, ast, template, &lib_source);
    resource_watch::build_resource_catalog(ast, template, vfs)
}

pub fn load_template_for_ast(ast: &DocumentAST) -> Result<TemplateSpec, String> {
    load_bundled_template(&ast.metadata.template_id)
}

pub fn compile_preview_success(
    world: &ErgoWorld,
    vfs: &VirtualFileSystem,
    session: &DocumentSession,
) -> Result<PreviewCompileSuccess, CompileError> {
    let document = compile_document(world)?;
    let outline = extract_outline(&document);
    let resources = session.ast().and_then(|ast| {
        load_template_for_ast(&ast)
            .ok()
            .map(|template| build_preview_resources(vfs, &ast, &template))
    });
    let preview_pages = canvas_preview_pages(document.pages.len());
    Ok(PreviewCompileSuccess {
        document,
        outline,
        preview_pages,
        resources,
    })
}

pub fn apply_document_events(
    session: &mut DocumentSession,
    events: Vec<DocumentEvent>,
) -> Result<crate::document_session_types::DocumentSessionStatus, String> {
    let mut status = session.status();
    for event in events {
        status = session.apply_event(event)?;
    }
    Ok(status)
}
