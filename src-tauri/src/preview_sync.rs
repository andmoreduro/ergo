use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::State;
use ts_rs::TS;
use typst::layout::{Abs, PagedDocument, Point, Position};
use typst::syntax::{FileId, VirtualPath};
use typst_ide::{jump_from_click, jump_from_cursor, Jump};

use crate::compiler::{SourceRevision, TauriAppState};
use crate::document_session::SourceMapEntry;
use crate::world::{SnapshotWorld, WorldSourceSnapshot};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct PreviewPageMetrics {
    pub page_number: usize,
    pub width_pt: f64,
    pub height_pt: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct PreviewElementPosition {
    pub element_id: Option<String>,
    pub page_number: usize,
    pub x_pt: f64,
    pub y_pt: f64,
    pub source_revision: SourceRevision,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct PreviewSyncStatus {
    pub source_revision: Option<SourceRevision>,
    pub pages: Vec<PreviewPageMetrics>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PreviewJumpResult {
    Element {
        element_id: String,
        source_revision: SourceRevision,
    },
    Position {
        position: PreviewElementPosition,
        source_revision: SourceRevision,
    },
    NoMatch {
        source_revision: Option<SourceRevision>,
        reason: String,
    },
    Unavailable {
        source_revision: Option<SourceRevision>,
        reason: String,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PreviewElementPositionsResult {
    Matched {
        positions: Vec<PreviewElementPosition>,
        source_revision: SourceRevision,
    },
    NoMatch {
        source_revision: Option<SourceRevision>,
        reason: String,
    },
    Unavailable {
        source_revision: Option<SourceRevision>,
        reason: String,
    },
}

#[derive(Clone)]
struct RetainedPreviewDocument {
    source_revision: SourceRevision,
    document: PagedDocument,
    source_map: Vec<SourceMapEntry>,
    source_snapshot: WorldSourceSnapshot,
    pages: Vec<PreviewPageMetrics>,
}

#[derive(Default)]
pub struct PreviewSyncState {
    inner: Mutex<Option<RetainedPreviewDocument>>,
}

impl PreviewSyncState {
    pub fn store_preview(
        &self,
        source_revision: SourceRevision,
        document: PagedDocument,
        source_map: Vec<SourceMapEntry>,
        source_snapshot: WorldSourceSnapshot,
    ) {
        let pages = document
            .pages
            .iter()
            .enumerate()
            .map(|(index, page)| {
                let size = page.frame.size();
                PreviewPageMetrics {
                    page_number: index + 1,
                    width_pt: size.x.to_pt(),
                    height_pt: size.y.to_pt(),
                }
            })
            .collect();

        *self.inner.lock() = Some(RetainedPreviewDocument {
            source_revision,
            document,
            source_map,
            source_snapshot,
            pages,
        });
    }

    pub fn status(&self) -> PreviewSyncStatus {
        self.inner
            .lock()
            .as_ref()
            .map(|preview| PreviewSyncStatus {
                source_revision: Some(preview.source_revision),
                pages: preview.pages.clone(),
            })
            .unwrap_or_else(|| PreviewSyncStatus {
                source_revision: None,
                pages: Vec::new(),
            })
    }

    pub fn jump_from_click(
        &self,
        page_number: usize,
        x_pt: f64,
        y_pt: f64,
        source_revision: SourceRevision,
    ) -> PreviewJumpResult {
        let preview = match self.preview_for_revision(source_revision) {
            Ok(preview) => preview,
            Err(result) => return result,
        };

        let Some(page) = preview.document.pages.get(page_number.saturating_sub(1)) else {
            return PreviewJumpResult::NoMatch {
                source_revision: Some(preview.source_revision),
                reason: "Preview page is not available".to_string(),
            };
        };

        let main_id = FileId::new(None, VirtualPath::new("main.typ"));
        let world = SnapshotWorld::new(preview.source_snapshot.clone(), main_id);
        let point = Point::new(Abs::pt(x_pt), Abs::pt(y_pt));

        match jump_from_click(&world, &preview.document, &page.frame, point) {
            Some(Jump::File(file_id, offset)) => {
                let file_path = path_from_file_id(file_id);
                if let Some(entry) =
                    source_entry_for_offset(&preview.source_map, &file_path, offset)
                {
                    PreviewJumpResult::Element {
                        element_id: entry.element_id.clone(),
                        source_revision: preview.source_revision,
                    }
                } else {
                    PreviewJumpResult::NoMatch {
                        source_revision: Some(preview.source_revision),
                        reason: "No Érgo element owns the clicked source range".to_string(),
                    }
                }
            }
            Some(Jump::Position(position)) => PreviewJumpResult::Position {
                position: preview_position(position, None, preview.source_revision),
                source_revision: preview.source_revision,
            },
            Some(Jump::Url(_)) => PreviewJumpResult::NoMatch {
                source_revision: Some(preview.source_revision),
                reason: "External links do not map to editor elements".to_string(),
            },
            None => PreviewJumpResult::NoMatch {
                source_revision: Some(preview.source_revision),
                reason: "No source span was found at the clicked position".to_string(),
            },
        }
    }

    pub fn positions_for_element(
        &self,
        element_id: &str,
        source_revision: SourceRevision,
    ) -> PreviewElementPositionsResult {
        let preview = match self.preview_for_revision(source_revision) {
            Ok(preview) => preview,
            Err(result) => {
                return match result {
                    PreviewJumpResult::Unavailable {
                        source_revision,
                        reason,
                    } => PreviewElementPositionsResult::Unavailable {
                        source_revision,
                        reason,
                    },
                    PreviewJumpResult::NoMatch {
                        source_revision,
                        reason,
                    } => PreviewElementPositionsResult::NoMatch {
                        source_revision,
                        reason,
                    },
                    PreviewJumpResult::Element { .. } | PreviewJumpResult::Position { .. } => {
                        PreviewElementPositionsResult::NoMatch {
                            source_revision: None,
                            reason: "Preview sync is not available".to_string(),
                        }
                    }
                };
            }
        };

        let Some(entry) = preview
            .source_map
            .iter()
            .find(|entry| entry.element_id == element_id)
        else {
            return PreviewElementPositionsResult::NoMatch {
                source_revision: Some(preview.source_revision),
                reason: "Element is not present in the preview source map".to_string(),
            };
        };

        let source = match preview.source_snapshot.source_for_path(&entry.file_path) {
            Ok(source) => source,
            Err(message) => {
                return PreviewElementPositionsResult::Unavailable {
                    source_revision: Some(preview.source_revision),
                    reason: message,
                };
            }
        };

        let mut positions = Vec::new();
        for offset in candidate_offsets(source.text(), entry.byte_start, entry.byte_end) {
            let next = jump_from_cursor(&preview.document, &source, offset)
                .into_iter()
                .map(|position| {
                    preview_position(
                        position,
                        Some(element_id.to_string()),
                        preview.source_revision,
                    )
                })
                .collect::<Vec<_>>();

            if !next.is_empty() {
                positions = next;
                break;
            }
        }

        if positions.is_empty() {
            PreviewElementPositionsResult::NoMatch {
                source_revision: Some(preview.source_revision),
                reason: "Element does not have a resolved preview position".to_string(),
            }
        } else {
            PreviewElementPositionsResult::Matched {
                positions,
                source_revision: preview.source_revision,
            }
        }
    }

    fn preview_for_revision(
        &self,
        source_revision: SourceRevision,
    ) -> Result<RetainedPreviewDocument, PreviewJumpResult> {
        let Some(preview) = self.inner.lock().clone() else {
            return Err(PreviewJumpResult::Unavailable {
                source_revision: None,
                reason: "No compiled preview is available".to_string(),
            });
        };

        if preview.source_revision != source_revision {
            return Err(PreviewJumpResult::Unavailable {
                source_revision: Some(preview.source_revision),
                reason: "The displayed preview revision does not match the retained preview"
                    .to_string(),
            });
        }

        Ok(preview)
    }
}

fn preview_position(
    position: Position,
    element_id: Option<String>,
    source_revision: SourceRevision,
) -> PreviewElementPosition {
    PreviewElementPosition {
        element_id,
        page_number: position.page.get(),
        x_pt: position.point.x.to_pt(),
        y_pt: position.point.y.to_pt(),
        source_revision,
    }
}

fn source_entry_for_offset<'a>(
    source_map: &'a [SourceMapEntry],
    file_path: &str,
    offset: usize,
) -> Option<&'a SourceMapEntry> {
    source_map
        .iter()
        .filter(|entry| {
            entry.file_path == file_path && offset >= entry.byte_start && offset < entry.byte_end
        })
        .min_by_key(|entry| entry.byte_end.saturating_sub(entry.byte_start))
}

fn candidate_offsets(text: &str, start: usize, end: usize) -> Vec<usize> {
    let mut start = start.min(text.len());
    let mut end = end.min(text.len());

    while start > 0 && !text.is_char_boundary(start) {
        start -= 1;
    }

    while end < text.len() && !text.is_char_boundary(end) {
        end += 1;
    }

    if start >= end {
        return Vec::new();
    }

    let mut offsets = text[start..end]
        .char_indices()
        .map(|(relative, _)| start + relative)
        .collect::<Vec<_>>();

    if end > start {
        let mut last = end - 1;
        while last > start && !text.is_char_boundary(last) {
            last -= 1;
        }
        offsets.push(last);
    }

    offsets.sort_unstable();
    offsets.dedup();
    offsets
}

fn path_from_file_id(file_id: FileId) -> String {
    file_id
        .vpath()
        .as_rootless_path()
        .to_string_lossy()
        .replace('\\', "/")
}

#[tauri::command]
pub fn jump_from_preview_click(
    state: State<'_, TauriAppState>,
    page_number: usize,
    x_pt: f64,
    y_pt: f64,
    source_revision: SourceRevision,
) -> Result<PreviewJumpResult, String> {
    Ok(state.preview_sync.jump_from_click(
        page_number,
        x_pt,
        y_pt,
        source_revision,
    ))
}

#[tauri::command]
pub fn get_preview_positions_for_element(
    state: State<'_, TauriAppState>,
    element_id: String,
    source_revision: SourceRevision,
) -> Result<PreviewElementPositionsResult, String> {
    Ok(state
        .preview_sync
        .positions_for_element(&element_id, source_revision))
}

#[tauri::command]
pub fn get_preview_sync_status(
    state: State<'_, TauriAppState>,
) -> Result<PreviewSyncStatus, String> {
    Ok(state.preview_sync.status())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::{
        ContentSection, CoverPageSection, DependencyManifest, DocumentAST, DocumentElement,
        DocumentSection, GlobalSettings, Heading, Paragraph, ProjectMetadata, ProjectSettings,
        RichText,
    };
    use crate::document_session::DocumentSession;
    use crate::vfs::VirtualFileSystem;
    use crate::world::ErgoWorld;
    use std::sync::Arc;
    use typst_ide::IdeWorld;

    fn test_ast() -> DocumentAST {
        DocumentAST {
            version: "1.0".to_string(),
            metadata: ProjectMetadata {
                template_id: "apa7".to_string(),
                title: "Título con ñ".to_string(),
                project_settings: ProjectSettings::default(),
                local_overrides: GlobalSettings::default(),
            },
            dependencies: DependencyManifest { packages: vec![] },
            references: vec![],
            assets: vec![],
            sections: vec![
                DocumentSection::CoverPage(CoverPageSection {
                    id: "cover-section".to_string(),
                    is_optional: true,
                    authors: vec![],
                    affiliations: vec![],
                    abstract_text: String::new(),
                }),
                DocumentSection::Content(ContentSection {
                    id: "content-section".to_string(),
                    is_optional: false,
                    elements: vec![
                        DocumentElement::Heading(Heading {
                            id: "heading-ñ".to_string(),
                            level: 2,
                            content: vec![RichText {
                                text: "Introducción".to_string(),
                                bold: None,
                                italic: None,
                                kind: None,
                                reference_id: None,
                                equation_source: None,
                            }],
                        }),
                        DocumentElement::Paragraph(Paragraph {
                            id: "paragraph-emoji".to_string(),
                            content: vec![RichText {
                                text: "Niñez, acción y símbolos 🌍.".to_string(),
                                bold: None,
                                italic: None,
                                kind: None,
                                reference_id: None,
                                equation_source: None,
                            }],
                        }),
                    ],
                }),
            ],
        }
    }

    fn compile_preview(
        vfs: Arc<VirtualFileSystem>,
        source_revision: SourceRevision,
        source_map: Vec<SourceMapEntry>,
    ) -> PreviewSyncState {
        let main_id = FileId::new(None, VirtualPath::new("main.typ"));
        let source_snapshot = WorldSourceSnapshot::from_vfs(&vfs);
        let world = SnapshotWorld::new(source_snapshot.clone(), main_id);
        let document = typst::compile::<PagedDocument>(&world).output.unwrap();
        let state = PreviewSyncState::default();
        state.store_preview(source_revision, document, source_map, source_snapshot);
        state
    }

    #[test]
    fn ergo_world_satisfies_ide_world() {
        fn assert_ide_world<T: IdeWorld>() {}
        assert_ide_world::<ErgoWorld>();
    }

    #[test]
    fn returns_positions_for_heading_and_unicode_paragraph() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let status = session.sync_snapshot(test_ast()).unwrap();
        let sync = compile_preview(Arc::clone(&vfs), status.source_revision, status.source_map);

        let heading = sync.positions_for_element("heading-ñ", status.source_revision);
        let paragraph = sync.positions_for_element("paragraph-emoji", status.source_revision);

        assert!(matches!(
            heading,
            PreviewElementPositionsResult::Matched { ref positions, .. } if !positions.is_empty()
        ));
        assert!(matches!(
            paragraph,
            PreviewElementPositionsResult::Matched { ref positions, .. } if !positions.is_empty()
        ));
    }

    #[test]
    fn maps_preview_click_to_heading_element() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let status = session.sync_snapshot(test_ast()).unwrap();
        let sync = compile_preview(
            Arc::clone(&vfs),
            status.source_revision,
            status.source_map.clone(),
        );

        let positions = match sync.positions_for_element("heading-ñ", status.source_revision) {
            PreviewElementPositionsResult::Matched { positions, .. } => positions,
            result => panic!("expected heading preview position, got {result:?}"),
        };
        let first = positions.first().unwrap();
        let result = sync.jump_from_click(
            first.page_number,
            first.x_pt + 1.0,
            first.y_pt - 1.0,
            status.source_revision,
        );

        match result {
            PreviewJumpResult::Element { element_id, .. } => {
                assert_eq!(element_id, "heading-ñ");
            }
            result => panic!("expected heading element jump, got {result:?}"),
        }
    }

    #[test]
    fn maps_preview_click_to_paragraph_element() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let status = session.sync_snapshot(test_ast()).unwrap();
        let sync = compile_preview(
            Arc::clone(&vfs),
            status.source_revision,
            status.source_map.clone(),
        );

        let positions =
            match sync.positions_for_element("paragraph-emoji", status.source_revision) {
                PreviewElementPositionsResult::Matched { positions, .. } => positions,
                result => panic!("expected paragraph preview position, got {result:?}"),
            };
        let first = positions.first().unwrap();
        let result = sync.jump_from_click(
            first.page_number,
            first.x_pt + 1.0,
            first.y_pt - 1.0,
            status.source_revision,
        );

        match result {
            PreviewJumpResult::Element { element_id, .. } => {
                assert_eq!(element_id, "paragraph-emoji");
            }
            result => panic!("expected paragraph element jump, got {result:?}"),
        }
    }

    #[test]
    fn preview_click_uses_retained_sources_after_document_edits() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let mut ast = test_ast();
        let status = session.sync_snapshot(ast.clone()).unwrap();
        let sync = compile_preview(
            Arc::clone(&vfs),
            status.source_revision,
            status.source_map.clone(),
        );

        if let DocumentSection::Content(content) = &mut ast.sections[1] {
            if let DocumentElement::Paragraph(paragraph) = &mut content.elements[1] {
                paragraph.content[0].text = "Texto cambiado después del render.".to_string();
            }
        }

        let edited_status = session.sync_snapshot(ast).unwrap();
        assert_ne!(edited_status.source_revision, status.source_revision);

        let positions = match sync.positions_for_element("paragraph-emoji", status.source_revision)
        {
            PreviewElementPositionsResult::Matched { positions, .. } => positions,
            result => panic!("expected retained paragraph preview position, got {result:?}"),
        };
        let first = positions.first().unwrap();
        let result = sync.jump_from_click(
            first.page_number,
            first.x_pt + 1.0,
            first.y_pt - 1.0,
            status.source_revision,
        );

        match result {
            PreviewJumpResult::Element { element_id, .. } => {
                assert_eq!(element_id, "paragraph-emoji");
            }
            result => panic!("expected retained paragraph element jump, got {result:?}"),
        }
    }

    #[test]
    fn stale_revision_is_unavailable() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let status = session.sync_snapshot(test_ast()).unwrap();
        let sync = compile_preview(Arc::clone(&vfs), status.source_revision, status.source_map);

        let result = sync.positions_for_element("heading-ñ", status.source_revision + 1);

        assert!(matches!(
            result,
            PreviewElementPositionsResult::Unavailable { .. }
        ));
    }
}
