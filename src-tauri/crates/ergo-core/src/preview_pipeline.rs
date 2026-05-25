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
    /// `None` means the caller should keep its existing resource document.
    pub resource_document: Option<PagedDocument>,
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

pub fn compile_resource_previews(
    resource_world: &ErgoWorld,
    vfs: &VirtualFileSystem,
    ast: &DocumentAST,
    template: &TemplateSpec,
) -> Result<(Option<PagedDocument>, DocumentResources), CompileError> {
    let lib_source = crate::document_resources::resource_preview_lib_source(ast, template);
    resource_watch::write_resource_files(vfs, ast, template, &lib_source);

    match compile_document(resource_world) {
        Ok(document) => Ok((
            Some(document),
            resource_watch::build_resource_catalog(ast, template, vfs),
        )),
        Err(error) => Ok((
            None,
            resource_watch::build_resource_catalog_with_failure(
                ast,
                template,
                vfs,
                error.to_string(),
            ),
        )),
    }
}

pub fn load_template_for_ast(ast: &DocumentAST) -> Result<TemplateSpec, CompileError> {
    let spec = load_bundled_template(&ast.metadata.template_id).map_err(CompileError::Operation)?;
    Ok(crate::template_spec::resolve_template_variant(
        &spec,
        ast.metadata
            .template_variant_id
            .as_deref()
            .map(crate::template_spec::typst_template_variant_id),
    ))
}

pub fn compile_preview_success(
    preview_world: &ErgoWorld,
    resource_world: &ErgoWorld,
    session: &DocumentSession,
    cached_resource_document: Option<&PagedDocument>,
) -> Result<PreviewCompileSuccess, CompileError> {
    let document = compile_document(preview_world)?;
    let outline = extract_outline(&document);
    let status = session.status();
    let vfs = preview_world.vfs();

    let (resource_document, resources) = match session.ast() {
        None => (None, None),
        Some(ast) => {
            let template = load_template_for_ast(&ast)?;
            let recompile_resources =
                cached_resource_document.is_none() || !status.dirty_resource_ids.is_empty();

            if recompile_resources {
                let (resource_document, resources) =
                    compile_resource_previews(resource_world, vfs, &ast, &template)?;
                (resource_document, Some(resources))
            } else {
                (
                    None,
                    Some(resource_watch::build_resource_catalog(&ast, &template, vfs)),
                )
            }
        }
    };

    let preview_pages = canvas_preview_pages(document.pages.len());
    Ok(PreviewCompileSuccess {
        document,
        resource_document,
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
