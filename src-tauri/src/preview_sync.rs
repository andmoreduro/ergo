use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::State;
use ts_rs::TS;
use typst::layout::{Abs, PagedDocument, Point, Position};
use typst::syntax::{FileId, VirtualPath};
use typst_ide::{jump_from_click, jump_from_cursor, Jump};

use crate::app_state::TauriAppState;
use crate::compilation_types::SourceRevision;
use crate::document_session::{FieldSourceMapEntry, SourceMapEntry};
use crate::path_utils::path_from_file_id;
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
    #[serde(default)]
    pub field_id: Option<String>,
    #[serde(default)]
    pub caret_utf16_offset: Option<usize>,
    pub page_number: usize,
    pub x_pt: f64,
    pub y_pt: f64,
    #[ts(type = "number")]
    pub source_revision: SourceRevision,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct PreviewFocusTarget {
    pub element_id: String,
    #[serde(default)]
    pub field_id: Option<String>,
    #[serde(default)]
    pub caret_utf16_offset: Option<usize>,
    #[ts(type = "number")]
    pub source_revision: SourceRevision,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct PreviewSyncStatus {
    #[ts(type = "number | null")]
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
    Field {
        target: PreviewFocusTarget,
        #[ts(type = "number")]
        source_revision: SourceRevision,
    },
    Element {
        element_id: String,
        #[ts(type = "number")]
        source_revision: SourceRevision,
    },
    Position {
        position: PreviewElementPosition,
        #[ts(type = "number")]
        source_revision: SourceRevision,
    },
    NoMatch {
        #[ts(type = "number | null")]
        source_revision: Option<SourceRevision>,
        reason: String,
    },
    Unavailable {
        #[ts(type = "number | null")]
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
        #[ts(type = "number")]
        source_revision: SourceRevision,
    },
    NoMatch {
        #[ts(type = "number | null")]
        source_revision: Option<SourceRevision>,
        reason: String,
    },
    Unavailable {
        #[ts(type = "number | null")]
        source_revision: Option<SourceRevision>,
        reason: String,
    },
}

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
    inner: Mutex<Option<RetainedPreviewDocument>>,
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

        *self.inner.lock() = Some(RetainedPreviewDocument {
            source_revision,
            document,
            source_map,
            field_source_map,
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
    ) -> Result<RetainedPreviewDocument, PreviewJumpResult> {
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

fn preview_position(
    position: Position,
    element_id: Option<String>,
    field_id: Option<String>,
    caret_utf16_offset: Option<usize>,
    source_revision: SourceRevision,
) -> PreviewElementPosition {
    PreviewElementPosition {
        element_id,
        field_id,
        caret_utf16_offset,
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

fn field_entry_for_offset<'a>(
    field_source_map: &'a [FieldSourceMapEntry],
    file_path: &str,
    offset: usize,
) -> Option<&'a FieldSourceMapEntry> {
    field_source_map
        .iter()
        .filter(|entry| {
            entry.file_path == file_path && offset >= entry.byte_start && offset < entry.byte_end
        })
        .min_by_key(|entry| entry.byte_end.saturating_sub(entry.byte_start))
        .or_else(|| {
            field_source_map
                .iter()
                .filter(|entry| entry.file_path == file_path && offset == entry.byte_end)
                .min_by_key(|entry| entry.byte_end.saturating_sub(entry.byte_start))
        })
}

fn field_entries_for_target<'a>(
    field_source_map: &'a [FieldSourceMapEntry],
    target: &PreviewFocusTarget,
) -> Vec<&'a FieldSourceMapEntry> {
    let Some(field_id) = target.field_id.as_deref() else {
        return Vec::new();
    };

    field_source_map
        .iter()
        .filter(|entry| entry.element_id == target.element_id && entry.field_id == field_id)
        .collect()
}

fn focus_target_for_field_offset(
    entry: &FieldSourceMapEntry,
    source_revision: SourceRevision,
    offset: usize,
) -> PreviewFocusTarget {
    PreviewFocusTarget {
        element_id: entry.element_id.clone(),
        field_id: Some(entry.field_id.clone()),
        caret_utf16_offset: caret_for_source_offset(entry, offset),
        source_revision,
    }
}

fn caret_for_source_offset(entry: &FieldSourceMapEntry, offset: usize) -> Option<usize> {
    for segment in &entry.segments {
        if offset == segment.source_byte_end {
            return Some(segment.field_utf16_end);
        }
        if offset >= segment.source_byte_start && offset < segment.source_byte_end {
            return Some(segment.field_utf16_start);
        }
    }

    if offset == entry.byte_end {
        return entry
            .segments
            .last()
            .map(|segment| segment.field_utf16_end)
            .or(entry.fallback_caret_utf16_offset);
    }

    entry.fallback_caret_utf16_offset
}

fn source_offset_for_caret(
    entry: &FieldSourceMapEntry,
    caret_utf16_offset: usize,
) -> Option<usize> {
    for segment in &entry.segments {
        if caret_utf16_offset == segment.field_utf16_start {
            return Some(segment.source_byte_start);
        }
        if caret_utf16_offset > segment.field_utf16_start
            && caret_utf16_offset <= segment.field_utf16_end
        {
            return Some(segment.source_byte_end);
        }
    }

    entry
        .segments
        .last()
        .filter(|segment| caret_utf16_offset >= segment.field_utf16_end)
        .map(|_| entry.byte_end)
        .or(entry.fallback_caret_utf16_offset.map(|_| entry.byte_start))
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

#[tauri::command]
pub fn jump_from_preview_click(
    state: State<'_, TauriAppState>,
    page_number: usize,
    x_pt: f64,
    y_pt: f64,
    source_revision: SourceRevision,
) -> Result<PreviewJumpResult, String> {
    Ok(state
        .preview_sync
        .jump_from_click(page_number, x_pt, y_pt, source_revision))
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
pub fn get_preview_positions_for_focus(
    state: State<'_, TauriAppState>,
    target: PreviewFocusTarget,
    source_revision: SourceRevision,
) -> Result<PreviewElementPositionsResult, String> {
    Ok(state
        .preview_sync
        .positions_for_focus(&target, source_revision))
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
    use crate::ast::{DocumentAST, DocumentElement, DocumentSection};
    use crate::document_session::{DocumentSession, FieldSourceMapEntry};
    use crate::test_fixtures::preview_sync_document_ast;
    use crate::vfs::VirtualFileSystem;
    use crate::world::ErgoWorld;
    use std::sync::Arc;
    use typst_ide::IdeWorld;

    fn test_ast() -> DocumentAST {
        preview_sync_document_ast()
    }

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
        let status = session.sync_snapshot(test_ast()).unwrap();
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
        let status = session.sync_snapshot(test_ast()).unwrap();
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
        let status = session.sync_snapshot(test_ast()).unwrap();
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
        let status = session.sync_snapshot(test_ast()).unwrap();
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
        let status = session.sync_snapshot(test_ast()).unwrap();
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
        let mut ast = test_ast();
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
        let status = session.sync_snapshot(test_ast()).unwrap();
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
