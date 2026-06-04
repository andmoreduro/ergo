use parking_lot::{Mutex, RwLock};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::ast::{DocumentAST, DocumentElement, DocumentSection};
use crate::document_session_events::apply_document_event;
use crate::document_session_generation::{default_layout, generate_project_sources_incremental};
pub use crate::document_session_types::{
    DocumentEvent, DocumentSessionStatus, FieldSourceMapEntry, FieldTextSegment, GeneratedFragment,
    ProjectSourceLayout, SourceMapEntry,
};
use crate::template_spec::TemplateSpec;
use crate::vfs::VirtualFileSystem;

pub(crate) const MAIN_PATH: &str = "main.typ";
pub(crate) const LIB_PATH: &str = "lib.typ";
pub(crate) const REFERENCES_PATH: &str = "references.bib";
pub(crate) const DOCUMENT_STATE_PATH: &str = ".ergproj/document_state.json";
pub(crate) const DEPENDENCY_MANIFEST_PATH: &str = ".ergproj/dependency_manifest.json";
pub(crate) const PROJECT_SETTINGS_PATH: &str = ".ergproj/project_settings.json";
pub(crate) const TEMPLATE_PATH: &str = ".ergproj/template.json";
pub(crate) const SOURCE_MAP_PATH: &str = ".ergproj/source_map.json";
pub(crate) const FIELD_SOURCE_MAP_PATH: &str = ".ergproj/field_source_map.json";

#[derive(Default)]
struct DocumentSessionInner {
    ast: Option<DocumentAST>,
    fragments: HashMap<String, GeneratedFragment>,
    element_content_hashes: HashMap<String, u64>,
    source_map: Vec<SourceMapEntry>,
    field_source_map: Vec<FieldSourceMapEntry>,
    last_status: Option<DocumentSessionStatus>,
    cached_template_spec: Option<(String, Option<String>, TemplateSpec)>,
}

pub struct DocumentSession {
    vfs: Arc<VirtualFileSystem>,
    inner: Mutex<DocumentSessionInner>,
    status_snapshot: RwLock<DocumentSessionStatus>,
    /// Whether to materialize the `.ergproj/*.json` sidecar files (document state,
    /// source maps, settings, manifest, template) into the VFS on every sync. The
    /// backend needs them for archive packing; the WASM preview session does not —
    /// Typst never imports them — so it skips the per-keystroke JSON encode + Source
    /// reparse of the whole AST. See [`DocumentSession::new_preview`].
    write_sidecar_files: bool,
}

impl DocumentSession {
    pub fn new(vfs: Arc<VirtualFileSystem>) -> Self {
        Self::with_sidecar_files(vfs, true)
    }

    /// Preview-only session for the WASM/compile path: skips the `.ergproj/*.json`
    /// sidecar writes that only the archive layer reads.
    pub fn new_preview(vfs: Arc<VirtualFileSystem>) -> Self {
        Self::with_sidecar_files(vfs, false)
    }

    fn with_sidecar_files(vfs: Arc<VirtualFileSystem>, write_sidecar_files: bool) -> Self {
        Self {
            vfs,
            inner: Mutex::new(DocumentSessionInner::default()),
            status_snapshot: RwLock::new(DocumentSessionStatus {
                source_revision: 0,
                layout: default_layout(Vec::new()),
                source_map: Vec::new(),
                field_source_map: Vec::new(),
                dirty_element_ids: Vec::new(),
                fragment_count: 0,
                dirty_resource_ids: Vec::new(),
            }),
            write_sidecar_files,
        }
    }

    pub fn status_snapshot(&self) -> DocumentSessionStatus {
        self.status_snapshot.read().clone()
    }

    pub fn sync_snapshot(&self, ast: DocumentAST) -> Result<DocumentSessionStatus, String> {
        let mut inner = self.inner.lock();
        let mut dirty_resource_ids = HashSet::new();
        if let Some(old_ast) = &inner.ast {
            // Find changed/new assets
            for asset in &ast.assets {
                let is_dirty = match old_ast.assets.iter().find(|a| a.id == asset.id) {
                    Some(old_asset) => old_asset != asset,
                    None => true,
                };
                if is_dirty {
                    dirty_resource_ids.insert(asset.id.clone());
                    dirty_resource_ids.extend(figure_ids_for_asset(&ast, &asset.id));
                }
            }
            // Find removed assets
            for old_asset in &old_ast.assets {
                if !ast.assets.iter().any(|a| a.id == old_asset.id) {
                    dirty_resource_ids.insert(old_asset.id.clone());
                    dirty_resource_ids.extend(figure_ids_for_asset(&ast, &old_asset.id));
                }
            }
        } else {
            // Initial sync: mark all resource IDs as dirty
            dirty_resource_ids = resource_ids_for_ast(&ast);
        }
        self.sync_ast_locked(&mut inner, ast, dirty_resource_ids)
    }

    pub fn apply_event(&self, event: DocumentEvent) -> Result<DocumentSessionStatus, String> {
        let mut inner = self.inner.lock();
        let mut ast = inner
            .ast
            .take()
            .ok_or_else(|| "Document session has not been initialized".to_string())?;
        let dirty_resource_ids = dirty_resource_ids_for_event(&ast, &event);
        if let Err(e) = apply_document_event(&mut ast, event) {
            inner.ast = Some(ast);
            return Err(e);
        }
        self.sync_ast_locked(&mut inner, ast, dirty_resource_ids)
    }

    pub fn apply_events(
        &self,
        events: Vec<DocumentEvent>,
    ) -> Result<DocumentSessionStatus, String> {
        if events.is_empty() {
            return Ok(self.status());
        }
        let mut inner = self.inner.lock();
        let mut ast = inner
            .ast
            .take()
            .ok_or_else(|| "Document session has not been initialized".to_string())?;
        let mut dirty_resource_ids = HashSet::new();
        for event in events {
            dirty_resource_ids.extend(dirty_resource_ids_for_event(&ast, &event));
            if let Err(e) = apply_document_event(&mut ast, event) {
                inner.ast = Some(ast);
                return Err(e);
            }
        }
        self.sync_ast_locked(&mut inner, ast, dirty_resource_ids)
    }

    fn sync_ast_locked(
        &self,
        inner: &mut DocumentSessionInner,
        ast: DocumentAST,
        dirty_resource_ids: HashSet<String>,
    ) -> Result<DocumentSessionStatus, String> {
        let template_spec = match &inner.cached_template_spec {
            Some((tid, vid, spec))
                if *tid == ast.metadata.template_id && *vid == ast.metadata.template_variant_id =>
            {
                spec.clone()
            }
            _ => {
                let spec = crate::template_spec::load_bundled_template(&ast.metadata.template_id)?;
                let resolved = crate::template_spec::resolve_template_variant(
                    &spec,
                    ast.metadata
                        .template_variant_id
                        .as_deref()
                        .map(crate::template_spec::typst_template_variant_id),
                );
                inner.cached_template_spec = Some((
                    ast.metadata.template_id.clone(),
                    ast.metadata.template_variant_id.clone(),
                    resolved.clone(),
                ));
                resolved
            }
        };
        let generated = generate_project_sources_incremental(
            &ast,
            &template_spec,
            &inner.fragments,
            &inner.element_content_hashes,
        );
        inner.element_content_hashes = generated.element_content_hashes;

        let mut dirty_element_ids = Vec::new();
        for (element_id, fragment) in &generated.fragments {
            let is_dirty = inner
                .fragments
                .get(element_id)
                .map(|existing| existing.source_hash != fragment.source_hash)
                .unwrap_or(true);
            if is_dirty {
                dirty_element_ids.push(element_id.clone());
            }
        }

        // Write per-element files
        let element_paths: HashSet<String> = generated
            .fragments
            .keys()
            .map(|id| element_vfs_path(id))
            .collect();
        let prev_element_paths: HashSet<String> = inner
            .fragments
            .keys()
            .map(|id| element_vfs_path(id))
            .collect();
        for stale_path in prev_element_paths.difference(&element_paths) {
            self.vfs.remove_path(stale_path);
        }

        for (element_id, fragment) in &generated.fragments {
            let path = element_vfs_path(element_id);
            if !self.vfs.is_source_equal(&path, &fragment.source) {
                self.vfs.write_source(&path, fragment.source.clone());
            }
        }

        write_source_if_changed(&self.vfs, MAIN_PATH, &generated.main_source);
        write_source_if_changed(&self.vfs, LIB_PATH, &generated.lib_source);
        write_source_if_changed(&self.vfs, REFERENCES_PATH, &generated.references_source);

        // Sidecar `.ergproj/*.json` files exist only for archive packing; Typst never
        // imports them. The preview session skips them so a keystroke does not pay for
        // a full-AST JSON encode plus a `Source` reparse of each blob.
        if self.write_sidecar_files {
            write_json_source(&self.vfs, DOCUMENT_STATE_PATH, &ast)?;
            write_json_source(&self.vfs, DEPENDENCY_MANIFEST_PATH, &ast.dependencies)?;
            write_json_source(
                &self.vfs,
                PROJECT_SETTINGS_PATH,
                &ast.metadata.project_settings,
            )?;
            write_source_if_changed(
                &self.vfs,
                TEMPLATE_PATH,
                &serde_json::json!({
                    "template_id": ast.metadata.template_id,
                    "template_variant_id": ast.metadata.template_variant_id,
                    "title": ast.metadata.title,
                })
                .to_string(),
            );
            write_json_source(&self.vfs, SOURCE_MAP_PATH, &generated.source_map)?;
            write_json_source(
                &self.vfs,
                FIELD_SOURCE_MAP_PATH,
                &generated.field_source_map,
            )?;
        }

        inner.ast = Some(ast);
        inner.fragments = generated.fragments;
        inner.source_map = generated.source_map;
        inner.field_source_map = generated.field_source_map;

        let status = DocumentSessionStatus {
            source_revision: self.vfs.latest_revision(),
            layout: generated.layout,
            source_map: inner.source_map.clone(),
            field_source_map: inner.field_source_map.clone(),
            dirty_element_ids,
            fragment_count: inner.fragments.len(),
            dirty_resource_ids: dirty_resource_ids.into_iter().collect(),
        };

        inner.last_status = Some(status.clone());
        *self.status_snapshot.write() = status.clone();

        Ok(status)
    }

    pub fn status(&self) -> DocumentSessionStatus {
        self.status_snapshot.read().clone()
    }

    /// Clone just the source map and field source map for `PreviewSyncState`,
    /// avoiding a full [`DocumentSessionStatus`] clone on the compile hot path.
    pub fn preview_sync_maps(&self) -> (Vec<SourceMapEntry>, Vec<FieldSourceMapEntry>) {
        let status = self.status_snapshot.read();
        (status.source_map.clone(), status.field_source_map.clone())
    }

    pub fn ast(&self) -> Option<DocumentAST> {
        self.inner.lock().ast.clone()
    }
}

fn write_json_source<T: Serialize>(
    vfs: &VirtualFileSystem,
    path: &str,
    value: &T,
) -> Result<u64, String> {
    let text = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    Ok(write_source_if_changed(vfs, path, &text))
}

fn dirty_resource_ids_for_event(ast: &DocumentAST, event: &DocumentEvent) -> HashSet<String> {
    let mut ids = HashSet::new();
    match event {
        DocumentEvent::SetProjectSettings { .. } => {
            ids.extend(resource_ids_for_ast(ast));
        }
        DocumentEvent::InsertElement { element, .. }
        | DocumentEvent::RestoreElement { element, .. } => {
            if let Some(resource_id) = resource_id_for_element(element) {
                ids.insert(resource_id);
            }
        }
        DocumentEvent::RemoveElement { element_id } => {
            ids.insert(element_id.clone());
        }
        DocumentEvent::UpdateEquation { element_id, .. }
        | DocumentEvent::UpdateFigure { element_id, .. }
        | DocumentEvent::UpdateDiagram { element_id, .. }
        | DocumentEvent::UpdateCustomElementField { element_id, .. } => {
            ids.insert(element_id.clone());
        }
        DocumentEvent::UpdateTableCell { table_id, .. }
        | DocumentEvent::InsertTableRow { table_id, .. }
        | DocumentEvent::RemoveTableRow { table_id, .. }
        | DocumentEvent::RestoreTableRow { table_id, .. }
        | DocumentEvent::InsertTableColumn { table_id, .. }
        | DocumentEvent::RemoveTableColumn { table_id, .. }
        | DocumentEvent::RestoreTableColumn { table_id, .. }
        | DocumentEvent::UpdateTableColumnSize { table_id, .. } => {
            ids.insert(table_id.clone());
        }
        DocumentEvent::UpdateElementExtraField { element_id, .. } => {
            if is_resource_element_id(ast, element_id) {
                ids.insert(element_id.clone());
            }
        }
        DocumentEvent::InsertAsset { asset, .. }
        | DocumentEvent::UpdateAsset { asset }
        | DocumentEvent::RestoreAsset { asset, .. } => {
            ids.insert(asset.id.clone());
            ids.extend(figure_ids_for_asset(ast, &asset.id));
        }
        DocumentEvent::RemoveAsset { asset_id } => {
            ids.insert(asset_id.clone());
            ids.extend(figure_ids_for_asset(ast, asset_id));
        }
        DocumentEvent::SetProjectTitle { .. }
        | DocumentEvent::SetTemplateVariant { .. }
        | DocumentEvent::UpdateInput { .. }
        | DocumentEvent::InsertInputArrayItem { .. }
        | DocumentEvent::RemoveInputArrayItem { .. }
        | DocumentEvent::UpdateParagraphText { .. }
        | DocumentEvent::UpdateParagraphContent { .. }
        | DocumentEvent::UpdateHeading { .. }
        | DocumentEvent::UpdateHeadingContent { .. }
        | DocumentEvent::InsertReference { .. }
        | DocumentEvent::UpdateReference { .. }
        | DocumentEvent::RemoveReference { .. }
        | DocumentEvent::RestoreReference { .. } => {}
    }
    ids
}

fn resource_ids_for_ast(ast: &DocumentAST) -> HashSet<String> {
    let mut ids = ast
        .assets
        .iter()
        .map(|asset| asset.id.clone())
        .collect::<HashSet<_>>();

    for element in ast.sections.iter().flat_map(section_elements) {
        if let Some(resource_id) = resource_id_for_element(element) {
            ids.insert(resource_id);
        }
    }

    ids
}

fn is_resource_element_id(ast: &DocumentAST, element_id: &str) -> bool {
    ast.sections
        .iter()
        .flat_map(section_elements)
        .any(|element| resource_id_for_element(element).as_deref() == Some(element_id))
}

fn resource_id_for_element(element: &DocumentElement) -> Option<String> {
    match element {
        DocumentElement::Table(table) => Some(table.id.clone()),
        DocumentElement::Equation(equation) => Some(equation.id.clone()),
        DocumentElement::Figure(figure) => Some(figure.id.clone()),
        DocumentElement::Diagram(diagram) => Some(diagram.id.clone()),
        DocumentElement::Custom(custom) => Some(custom.id.clone()),
        DocumentElement::Heading(_)
        | DocumentElement::Paragraph(_)
        | DocumentElement::Quote(_)
        | DocumentElement::List(_)
        | DocumentElement::Enumeration(_) => None,
    }
}

fn figure_ids_for_asset(ast: &DocumentAST, asset_id: &str) -> HashSet<String> {
    ast.sections
        .iter()
        .flat_map(section_elements)
        .filter_map(|element| match element {
            DocumentElement::Figure(figure) if figure.asset_id.as_deref() == Some(asset_id) => {
                Some(figure.id.clone())
            }
            DocumentElement::Diagram(diagram) if diagram.asset_id.as_deref() == Some(asset_id) => {
                Some(diagram.id.clone())
            }
            _ => None,
        })
        .collect()
}

fn section_elements(section: &DocumentSection) -> &[DocumentElement] {
    let DocumentSection::Content(content) = section;
    &content.elements
}

fn element_vfs_path(element_id: &str) -> String {
    format!("elements/{}.typ", path_id_for_id(element_id))
}

fn path_id_for_id(id: &str) -> String {
    let mut normalized = String::new();
    let mut previous_was_dash = false;
    for character in id.to_lowercase().chars() {
        let next = if character.is_ascii_alphanumeric() || character == '_' {
            Some(character)
        } else {
            Some('-')
        };
        if let Some(character) = next {
            if character == '-' {
                if !previous_was_dash {
                    normalized.push(character);
                }
                previous_was_dash = true;
            } else {
                normalized.push(character);
                previous_was_dash = false;
            }
        }
    }
    normalized.trim_matches('-').to_string()
}

fn write_source_if_changed(vfs: &VirtualFileSystem, path: &str, source: &str) -> u64 {
    if vfs.is_source_equal(path, source) {
        vfs.source_revision(path).unwrap_or(0)
    } else {
        vfs.write_source(path, source.to_string())
    }
}

#[cfg(test)]
#[allow(irrefutable_let_patterns, unreachable_patterns)]
#[path = "document_session_tests.rs"]
mod tests;
