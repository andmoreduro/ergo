use parking_lot::Mutex;
use std::sync::Arc;
use typst::layout::{Abs, PagedDocument, Point};
use typst::syntax::{FileId, VirtualPath};
use typst_ide::{jump_from_click, jump_from_cursor, Jump};

use crate::compilation_types::SourceRevision;
use crate::document_session::{FieldSourceMapEntry, SourceMapEntry};
use crate::path_utils::path_from_file_id;
use crate::preview_sync_lookup::{
    candidate_offsets, field_entries_for_target, field_entry_for_offset,
    focus_target_for_field_offset, preview_position, source_entry_for_offset,
    source_offset_for_caret,
};
pub use crate::preview_sync_types::{
    PreviewElementPosition, PreviewElementPositionsResult, PreviewFocusTarget, PreviewJumpResult,
    PreviewPageMetrics, PreviewSyncStatus,
};
use crate::world::{SnapshotWorld, WorldSourceSnapshot};

#[derive(Clone)]
struct RetainedPreviewDocument {
    source_revision: SourceRevision,
    document: PagedDocument,
    source_map: Vec<SourceMapEntry>,
    field_source_map: Vec<FieldSourceMapEntry>,
    source_snapshot: WorldSourceSnapshot,
    pages: Vec<PreviewPageMetrics>,
}

#[derive(Default)]
pub struct PreviewSyncState {
    inner: Mutex<Option<Arc<RetainedPreviewDocument>>>,
}

impl PreviewSyncState {
    pub fn store_preview(
        &self,
        source_revision: SourceRevision,
        document: PagedDocument,
        source_map: Vec<SourceMapEntry>,
        field_source_map: Vec<FieldSourceMapEntry>,
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

        *self.inner.lock() = Some(Arc::new(RetainedPreviewDocument {
            source_revision,
            document,
            source_map,
            field_source_map,
            source_snapshot,
            pages,
        }));
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
                    field_entry_for_offset(&preview.field_source_map, &file_path, offset)
                {
                    return PreviewJumpResult::Field {
                        target: focus_target_for_field_offset(
                            entry,
                            preview.source_revision,
                            offset,
                        ),
                        source_revision: preview.source_revision,
                    };
                }

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
                position: preview_position(position, None, None, None, preview.source_revision),
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
                    PreviewJumpResult::Field { .. }
                    | PreviewJumpResult::Element { .. }
                    | PreviewJumpResult::Position { .. } => {
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
                        None,
                        None,
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

    pub fn positions_for_focus(
        &self,
        target: &PreviewFocusTarget,
        source_revision: SourceRevision,
    ) -> PreviewElementPositionsResult {
        if target.source_revision != source_revision {
            return PreviewElementPositionsResult::Unavailable {
                source_revision: Some(source_revision),
                reason: "The focus target does not belong to the displayed preview revision"
                    .to_string(),
            };
        }

        let Some(field_id) = target.field_id.as_deref() else {
            return self.positions_for_element(&target.element_id, source_revision);
        };

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
                    PreviewJumpResult::Field { .. }
                    | PreviewJumpResult::Element { .. }
                    | PreviewJumpResult::Position { .. } => {
                        PreviewElementPositionsResult::NoMatch {
                            source_revision: None,
                            reason: "Preview sync is not available".to_string(),
                        }
                    }
                };
            }
        };

        let entries = field_entries_for_target(&preview.field_source_map, target);
        let Some(entry) = entries
            .iter()
            .copied()
            .find(|entry| !entry.segments.is_empty())
            .or_else(|| entries.first().copied())
        else {
            return self.positions_for_element(&target.element_id, source_revision);
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

        let offset = target
            .caret_utf16_offset
            .and_then(|caret| source_offset_for_caret(entry, caret))
            .or_else(|| {
                entry
                    .segments
                    .first()
                    .map(|segment| segment.source_byte_start)
            })
            .unwrap_or(entry.byte_start);

        let positions = jump_from_cursor(&preview.document, &source, offset)
            .into_iter()
            .map(|position| {
                preview_position(
                    position,
                    Some(target.element_id.clone()),
                    Some(field_id.to_string()),
                    target.caret_utf16_offset,
                    preview.source_revision,
                )
            })
            .collect::<Vec<_>>();

        if positions.is_empty() {
            PreviewElementPositionsResult::NoMatch {
                source_revision: Some(preview.source_revision),
                reason: "Field does not have a resolved preview position".to_string(),
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
    ) -> Result<Arc<RetainedPreviewDocument>, PreviewJumpResult> {
        let actual_revision = {
            let guard = self.inner.lock();
            guard.as_ref().map(|p| p.source_revision)
        };
        let Some(actual_revision) = actual_revision else {
            return Err(PreviewJumpResult::Unavailable {
                source_revision: None,
                reason: "No compiled preview is available".to_string(),
            });
        };
        if actual_revision != source_revision {
            return Err(PreviewJumpResult::Unavailable {
                source_revision: Some(actual_revision),
                reason: "The displayed preview revision does not match the retained preview"
                    .to_string(),
            });
        }
        self.inner
            .lock()
            .clone()
            .ok_or_else(|| PreviewJumpResult::Unavailable {
                source_revision: None,
                reason: "No compiled preview is available".to_string(),
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::{DocumentElement, DocumentSection};
    use crate::document_session::{DocumentSession, FieldSourceMapEntry};
    use crate::test_fixtures::preview_sync_document_ast;
    use crate::vfs::VirtualFileSystem;
    use crate::world::ErgoWorld;
    use std::sync::Arc;
    use typst_ide::IdeWorld;

    fn compile_preview(
        vfs: Arc<VirtualFileSystem>,
        source_revision: SourceRevision,
        source_map: Vec<SourceMapEntry>,
        field_source_map: Vec<FieldSourceMapEntry>,
    ) -> PreviewSyncState {
        let main_id = FileId::new(None, VirtualPath::new("main.typ"));
        let source_snapshot = WorldSourceSnapshot::from_vfs(&vfs);
        let world = SnapshotWorld::new(source_snapshot.clone(), main_id);
        let document = typst::compile::<PagedDocument>(&world).output.unwrap();
        let state = PreviewSyncState::default();
        state.store_preview(
            source_revision,
            document,
            source_map,
            field_source_map,
            source_snapshot,
        );
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
        let status = session.sync_snapshot(preview_sync_document_ast()).unwrap();
        let sync = compile_preview(
            Arc::clone(&vfs),
            status.source_revision,
            status.source_map,
            status.field_source_map,
        );

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
        let status = session.sync_snapshot(preview_sync_document_ast()).unwrap();
        let sync = compile_preview(
            Arc::clone(&vfs),
            status.source_revision,
            status.source_map.clone(),
            status.field_source_map.clone(),
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
            PreviewJumpResult::Field { target, .. } => {
                assert_eq!(target.element_id, "heading-ñ");
            }
            result => panic!("expected heading field jump, got {result:?}"),
        }
    }

    #[test]
    fn maps_preview_click_to_heading_field_target() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let status = session.sync_snapshot(preview_sync_document_ast()).unwrap();
        let sync = compile_preview(
            Arc::clone(&vfs),
            status.source_revision,
            status.source_map.clone(),
            status.field_source_map.clone(),
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
        let result_json = serde_json::to_value(result).unwrap();

        assert_eq!(
            result_json,
            serde_json::json!({
                "status": "field",
                "target": {
                    "elementId": "heading-ñ",
                    "fieldId": "heading-ñ:text",
                    "caretUtf16Offset": 0,
                    "sourceRevision": status.source_revision,
                },
                "sourceRevision": status.source_revision,
            })
        );
    }

    #[test]
    fn returns_preview_position_for_field_focus_target() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let status = session.sync_snapshot(preview_sync_document_ast()).unwrap();
        let sync = compile_preview(
            Arc::clone(&vfs),
            status.source_revision,
            status.source_map.clone(),
            status.field_source_map.clone(),
        );

        let result = sync.positions_for_focus(
            &PreviewFocusTarget {
                element_id: "heading-ñ".to_string(),
                field_id: Some("heading-ñ:text".to_string()),
                caret_utf16_offset: Some(0),
                source_revision: status.source_revision,
            },
            status.source_revision,
        );

        assert!(matches!(
            result,
            PreviewElementPositionsResult::Matched { ref positions, .. }
                if positions
                    .iter()
                    .any(|position| position.field_id.as_deref() == Some("heading-ñ:text"))
        ));
    }

    #[test]
    fn maps_preview_click_to_paragraph_element() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let status = session.sync_snapshot(preview_sync_document_ast()).unwrap();
        let sync = compile_preview(
            Arc::clone(&vfs),
            status.source_revision,
            status.source_map.clone(),
            status.field_source_map.clone(),
        );

        let positions = match sync.positions_for_element("paragraph-emoji", status.source_revision)
        {
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
            PreviewJumpResult::Field { target, .. } => {
                assert_eq!(target.element_id, "paragraph-emoji");
            }
            result => panic!("expected paragraph field jump, got {result:?}"),
        }
    }

    #[test]
    fn preview_click_uses_retained_sources_after_document_edits() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let mut ast = preview_sync_document_ast();
        let status = session.sync_snapshot(ast.clone()).unwrap();
        let sync = compile_preview(
            Arc::clone(&vfs),
            status.source_revision,
            status.source_map.clone(),
            status.field_source_map.clone(),
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
            PreviewJumpResult::Field { target, .. } => {
                assert_eq!(target.element_id, "paragraph-emoji");
            }
            result => panic!("expected retained paragraph field jump, got {result:?}"),
        }
    }

    #[test]
    fn stale_revision_is_unavailable() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let status = session.sync_snapshot(preview_sync_document_ast()).unwrap();
        let sync = compile_preview(
            Arc::clone(&vfs),
            status.source_revision,
            status.source_map,
            status.field_source_map,
        );

        let result = sync.positions_for_element("heading-ñ", status.source_revision + 1);

        assert!(matches!(
            result,
            PreviewElementPositionsResult::Unavailable { .. }
        ));
    }
}
