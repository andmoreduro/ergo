use parking_lot::Mutex;
use std::sync::Arc;
use typst::layout::{Abs, Frame, FrameItem, PagedDocument, Point};
use typst::syntax::{FileId, Source, SyntaxKind, VirtualPath};
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
    PreviewCaretCue, PreviewElementPosition, PreviewElementPositionsResult, PreviewFocusTarget,
    PreviewJumpResult, PreviewPageMetrics, PreviewSyncStatus,
};
use crate::world::{SnapshotWorld, WorldSourceSnapshot};

#[derive(Clone)]
struct RetainedPreviewDocument {
    source_revision: SourceRevision,
    document: Arc<PagedDocument>,
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
        document: Arc<PagedDocument>,
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

        let preferred_offset = target
            .caret_utf16_offset
            .and_then(|caret| source_offset_for_caret(entry, caret))
            .or_else(|| {
                entry
                    .segments
                    .first()
                    .map(|segment| segment.source_byte_start)
            })
            .unwrap_or(entry.byte_start);

        let mut positions = positions_for_field_entry(
            &preview,
            entry,
            &source,
            &target.element_id,
            field_id,
            target.caret_utf16_offset,
            preferred_offset,
        );

        if positions.is_empty() {
            for fallback_field_id in
                related_template_input_field_ids(field_id, entry, source.text())
            {
                let Some(fallback_entry) = preview.field_source_map.iter().find(|candidate| {
                    candidate.element_id == target.element_id
                        && candidate.field_id == fallback_field_id
                }) else {
                    continue;
                };
                let Ok(fallback_source) = preview
                    .source_snapshot
                    .source_for_path(&fallback_entry.file_path)
                else {
                    continue;
                };
                let fallback_offset = fallback_entry
                    .segments
                    .first()
                    .map(|segment| segment.source_byte_start)
                    .unwrap_or(fallback_entry.byte_start);
                positions = positions_for_field_entry(
                    &preview,
                    fallback_entry,
                    &fallback_source,
                    &target.element_id,
                    field_id,
                    target.caret_utf16_offset,
                    fallback_offset,
                );
                if !positions.is_empty() {
                    break;
                }
            }
        }

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

fn positions_for_field_entry(
    preview: &RetainedPreviewDocument,
    entry: &FieldSourceMapEntry,
    source: &typst::syntax::Source,
    element_id: &str,
    field_id: &str,
    caret_utf16_offset: Option<usize>,
    preferred_offset: usize,
) -> Vec<PreviewElementPosition> {
    if let Some(caret_utf16_offset) = caret_utf16_offset {
        let positions = roundtrip_positions_for_field_caret(
            preview,
            entry,
            source,
            element_id,
            field_id,
            caret_utf16_offset,
        );
        if !positions.is_empty() {
            return positions;
        }
    }

    let mut offsets = vec![preferred_offset];
    offsets.extend(
        candidate_offsets(source.text(), entry.byte_start, entry.byte_end)
            .into_iter()
            .filter(|offset| *offset != preferred_offset),
    );
    offsets.dedup();

    for offset in offsets {
        let positions = jump_from_cursor(&preview.document, source, offset)
            .into_iter()
            .map(|position| {
                preview_position(
                    position,
                    Some(element_id.to_string()),
                    Some(field_id.to_string()),
                    caret_utf16_offset,
                    preview.source_revision,
                )
            })
            .collect::<Vec<_>>();

        if !positions.is_empty() {
            return positions;
        }
    }

    Vec::new()
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum CaretClickBoundary {
    Leading,
    Trailing,
}

#[derive(Clone, Copy)]
struct CaretSourceTarget {
    source_byte_offset: usize,
    boundary: CaretClickBoundary,
}

#[derive(Clone)]
struct PreviewClickCandidate {
    point: Point,
    top_y: Abs,
    height: Abs,
}

fn roundtrip_positions_for_field_caret(
    preview: &RetainedPreviewDocument,
    entry: &FieldSourceMapEntry,
    source: &Source,
    element_id: &str,
    field_id: &str,
    caret_utf16_offset: usize,
) -> Vec<PreviewElementPosition> {
    let source_targets = caret_source_targets(entry, caret_utf16_offset);
    if source_targets.is_empty() {
        return Vec::new();
    }

    let main_id = FileId::new(None, VirtualPath::new("main.typ"));
    let world = SnapshotWorld::new(preview.source_snapshot.clone(), main_id);
    let mut positions = Vec::new();

    for (index, page) in preview.document.pages.iter().enumerate() {
        let page_number = index + 1;
        for candidate in
            click_candidates_for_source_targets(&page.frame, source, &source_targets, Point::zero())
        {
            if !candidate_roundtrips_to_focus(
                preview,
                &world,
                page_number,
                candidate.point,
                element_id,
                field_id,
                caret_utf16_offset,
            ) {
                continue;
            }

            positions.push(PreviewElementPosition {
                element_id: Some(element_id.to_string()),
                field_id: Some(field_id.to_string()),
                caret_utf16_offset: Some(caret_utf16_offset),
                page_number,
                x_pt: candidate.point.x.to_pt(),
                y_pt: candidate.point.y.to_pt(),
                caret_cue: Some(PreviewCaretCue {
                    top_y_pt: candidate.top_y.to_pt(),
                    height_pt: candidate.height.to_pt(),
                }),
                source_revision: preview.source_revision,
            });
            break;
        }
    }

    positions
}

fn caret_source_targets(
    entry: &FieldSourceMapEntry,
    caret_utf16_offset: usize,
) -> Vec<CaretSourceTarget> {
    let mut targets = Vec::new();

    for segment in &entry.segments {
        if caret_utf16_offset == segment.field_utf16_start {
            targets.push(CaretSourceTarget {
                source_byte_offset: segment.source_byte_start,
                boundary: CaretClickBoundary::Leading,
            });
        }
        if caret_utf16_offset == segment.field_utf16_end {
            targets.push(CaretSourceTarget {
                source_byte_offset: segment.source_byte_end,
                boundary: CaretClickBoundary::Trailing,
            });
        }
    }

    targets
}

fn click_candidates_for_source_targets(
    frame: &Frame,
    source: &Source,
    targets: &[CaretSourceTarget],
    origin: Point,
) -> Vec<PreviewClickCandidate> {
    let mut candidates = Vec::new();

    for &(pos, ref item) in frame.items() {
        let pos = origin + pos;
        match item {
            FrameItem::Group(group) if group.transform.is_identity() => {
                candidates.extend(click_candidates_for_source_targets(
                    &group.frame,
                    source,
                    targets,
                    pos,
                ));
            }
            FrameItem::Group(group)
                if group.transform.kx.is_zero() && group.transform.ky.is_zero() =>
            {
                let child_candidates = click_candidates_for_source_targets(
                    &group.frame,
                    source,
                    targets,
                    Point::zero(),
                );
                candidates.extend(child_candidates.into_iter().map(|candidate| {
                    let top = Point::new(Abs::zero(), candidate.top_y).transform(group.transform);
                    PreviewClickCandidate {
                        point: pos + candidate.point.transform(group.transform),
                        top_y: pos.y + top.y,
                        height: group.transform.sy.of(candidate.height),
                    }
                }));
            }
            FrameItem::Group(_) => {}
            FrameItem::Text(text) => {
                let mut glyph_pos = pos;
                for glyph in &text.glyphs {
                    let width = glyph.x_advance.at(text.size);
                    let (span, span_offset) = glyph.span;
                    let Some(node) = source.find(span) else {
                        glyph_pos.x += width;
                        continue;
                    };

                    if matches!(node.kind(), SyntaxKind::Text | SyntaxKind::MathText) {
                        let range = node.range();
                        let glyph_start = range.start + usize::from(span_offset);
                        let glyph_end = glyph_start + glyph.range().len();

                        for target in targets {
                            let x = match target.boundary {
                                CaretClickBoundary::Leading
                                    if target.source_byte_offset == glyph_start =>
                                {
                                    Some(glyph_pos.x + width / 4.0)
                                }
                                CaretClickBoundary::Trailing
                                    if target.source_byte_offset == glyph_end =>
                                {
                                    Some(glyph_pos.x + width * 0.75)
                                }
                                _ => None,
                            };

                            if let Some(x) = x {
                                let top_y = glyph_pos.y - text.size;
                                candidates.push(PreviewClickCandidate {
                                    point: Point::new(x, top_y + text.size / 2.0),
                                    top_y,
                                    height: text.size,
                                });
                            }
                        }
                    }

                    glyph_pos.x += width;
                }
            }
            FrameItem::Shape(_, _)
            | FrameItem::Image(_, _, _)
            | FrameItem::Link(_, _)
            | FrameItem::Tag(_) => {}
        }
    }

    candidates
}

fn candidate_roundtrips_to_focus(
    preview: &RetainedPreviewDocument,
    world: &SnapshotWorld,
    page_number: usize,
    point: Point,
    element_id: &str,
    field_id: &str,
    caret_utf16_offset: usize,
) -> bool {
    let Some(page) = preview.document.pages.get(page_number.saturating_sub(1)) else {
        return false;
    };

    let Some(Jump::File(file_id, offset)) =
        jump_from_click(world, &preview.document, &page.frame, point)
    else {
        return false;
    };

    let file_path = path_from_file_id(file_id);
    let Some(entry) = field_entry_for_offset(&preview.field_source_map, &file_path, offset) else {
        return false;
    };

    let target = focus_target_for_field_offset(entry, preview.source_revision, offset);
    target.element_id == element_id
        && target.field_id.as_deref() == Some(field_id)
        && target.caret_utf16_offset == Some(caret_utf16_offset)
}

fn related_template_input_field_ids(
    field_id: &str,
    entry: &FieldSourceMapEntry,
    source_text: &str,
) -> Vec<String> {
    let parts = field_id
        .strip_prefix('/')
        .map(|path| path.split('/').collect::<Vec<_>>())
        .unwrap_or_default();
    if parts.len() != 4 || parts[0] != "authors" || parts[2] != "affiliations" {
        return Vec::new();
    }

    let mut fallback_ids = vec![format!("/authors/{}/name", parts[1])];
    let reference = field_text(entry, source_text);
    if let Some(index) = reference
        .trim()
        .parse::<usize>()
        .ok()
        .and_then(|value| value.checked_sub(1))
    {
        fallback_ids.push(format!("/affiliations/{index}"));
    }
    fallback_ids
}

fn field_text(entry: &FieldSourceMapEntry, source_text: &str) -> String {
    entry
        .segments
        .iter()
        .filter_map(|segment| source_text.get(segment.source_byte_start..segment.source_byte_end))
        .collect()
}

#[cfg(test)]
#[allow(irrefutable_let_patterns)]
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
            Arc::new(document),
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
    fn returns_preview_position_for_abstract_input_focus_target() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let mut ast = preview_sync_document_ast();
        ast.inputs.insert(
            "abstract_text".to_string(),
            serde_json::json!("Resumen con contenido visible."),
        );
        let status = session.sync_snapshot(ast).unwrap();
        let sync = compile_preview(
            Arc::clone(&vfs),
            status.source_revision,
            status.source_map.clone(),
            status.field_source_map.clone(),
        );

        let result = sync.positions_for_focus(
            &PreviewFocusTarget {
                element_id: "inputs".to_string(),
                field_id: Some("/abstract_text".to_string()),
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
                    .any(|position| position.field_id.as_deref() == Some("/abstract_text"))
        ));
    }

    #[test]
    fn focused_heading_caret_position_roundtrips_through_preview_click() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let status = session.sync_snapshot(preview_sync_document_ast()).unwrap();
        let sync = compile_preview(
            Arc::clone(&vfs),
            status.source_revision,
            status.source_map.clone(),
            status.field_source_map.clone(),
        );
        let target = PreviewFocusTarget {
            element_id: "heading-ñ".to_string(),
            field_id: Some("heading-ñ:text".to_string()),
            caret_utf16_offset: Some("Introducción".encode_utf16().count()),
            source_revision: status.source_revision,
        };

        let result = sync.positions_for_focus(&target, status.source_revision);
        let position = match result {
            PreviewElementPositionsResult::Matched { positions, .. } => positions
                .into_iter()
                .find(|position| position.field_id.as_deref() == target.field_id.as_deref())
                .expect("expected focused field position"),
            result => panic!("expected matched preview position, got {result:?}"),
        };

        let jump = sync.jump_from_click(
            position.page_number,
            position.x_pt,
            position.y_pt,
            status.source_revision,
        );

        assert!(matches!(
            jump,
            PreviewJumpResult::Field { target: ref actual, .. }
                if actual.element_id == target.element_id
                    && actual.field_id == target.field_id
                    && actual.caret_utf16_offset == target.caret_utf16_offset
        ));
    }

    #[test]
    fn apa_title_caret_position_roundtrips_through_preview_click() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let status = session.sync_snapshot(preview_sync_document_ast()).unwrap();
        let sync = compile_preview(
            Arc::clone(&vfs),
            status.source_revision,
            status.source_map.clone(),
            status.field_source_map.clone(),
        );
        let target = PreviewFocusTarget {
            element_id: "inputs".to_string(),
            field_id: Some("/title".to_string()),
            caret_utf16_offset: Some("Título con ñ".encode_utf16().count()),
            source_revision: status.source_revision,
        };

        let result = sync.positions_for_focus(&target, status.source_revision);
        let position = match result {
            PreviewElementPositionsResult::Matched { positions, .. } => positions
                .into_iter()
                .find(|position| {
                    position.field_id.as_deref() == target.field_id.as_deref()
                        && position.caret_cue.is_some()
                })
                .unwrap_or_else(|| panic!("expected focused title caret position")),
            result => panic!("expected matched preview position, got {result:?}"),
        };

        let jump = sync.jump_from_click(
            position.page_number,
            position.x_pt,
            position.y_pt,
            status.source_revision,
        );

        assert!(matches!(
            jump,
            PreviewJumpResult::Field { target: ref actual, .. }
                if actual.element_id == target.element_id
                    && actual.field_id == target.field_id
                    && actual.caret_utf16_offset == target.caret_utf16_offset
        ));
    }

    #[test]
    fn returns_preview_positions_for_nested_template_input_focus_targets() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let mut ast = preview_sync_document_ast();
        ast.inputs.insert(
            "affiliations".to_string(),
            serde_json::json!(["Universidad Norte"]),
        );
        ast.inputs.insert(
            "authors".to_string(),
            serde_json::json!([
                {
                    "name": "Ada Lovelace",
                    "affiliations": ["1"]
                }
            ]),
        );
        let status = session.sync_snapshot(ast).unwrap();
        let sync = compile_preview(
            Arc::clone(&vfs),
            status.source_revision,
            status.source_map.clone(),
            status.field_source_map.clone(),
        );

        for field_id in [
            "/authors/0/name",
            "/authors/0/affiliations/0",
            "/affiliations/0",
        ] {
            let result = sync.positions_for_focus(
                &PreviewFocusTarget {
                    element_id: "inputs".to_string(),
                    field_id: Some(field_id.to_string()),
                    caret_utf16_offset: Some(0),
                    source_revision: status.source_revision,
                },
                status.source_revision,
            );

            assert!(
                matches!(
                    result,
                    PreviewElementPositionsResult::Matched { ref positions, .. }
                        if positions
                            .iter()
                            .any(|position| position.field_id.as_deref() == Some(field_id))
                ),
                "expected matched preview position for {field_id}, got {result:?}",
            );
        }
    }

    #[test]
    fn apa_author_and_affiliation_caret_positions_roundtrip_through_preview_click() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let mut ast = preview_sync_document_ast();
        ast.inputs.insert(
            "affiliations".to_string(),
            serde_json::json!(["Universidad Norte"]),
        );
        ast.inputs.insert(
            "authors".to_string(),
            serde_json::json!([
                {
                    "name": "Ada Lovelace",
                    "affiliations": ["1"]
                }
            ]),
        );
        let status = session.sync_snapshot(ast).unwrap();
        let sync = compile_preview(
            Arc::clone(&vfs),
            status.source_revision,
            status.source_map.clone(),
            status.field_source_map.clone(),
        );

        for (field_id, text) in [
            ("/authors/0/name", "Ada Lovelace"),
            ("/affiliations/0", "Universidad Norte"),
        ] {
            let target = PreviewFocusTarget {
                element_id: "inputs".to_string(),
                field_id: Some(field_id.to_string()),
                caret_utf16_offset: Some(text.encode_utf16().count()),
                source_revision: status.source_revision,
            };
            let result = sync.positions_for_focus(&target, status.source_revision);
            let position = match result {
                PreviewElementPositionsResult::Matched { positions, .. } => positions
                    .into_iter()
                    .find(|position| {
                        position.field_id.as_deref() == Some(field_id)
                            && position.caret_cue.is_some()
                    })
                    .unwrap_or_else(|| {
                        panic!("expected focused APA caret position for {field_id}")
                    }),
                result => {
                    panic!("expected matched preview position for {field_id}, got {result:?}")
                }
            };

            let jump = sync.jump_from_click(
                position.page_number,
                position.x_pt,
                position.y_pt,
                status.source_revision,
            );

            assert!(
                matches!(
                    jump,
                    PreviewJumpResult::Field { target: ref actual, .. }
                        if actual.element_id == target.element_id
                            && actual.field_id == target.field_id
                            && actual.caret_utf16_offset == target.caret_utf16_offset
                ),
                "expected APA preview click to roundtrip to {field_id}, got {jump:?}",
            );
        }
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

        if let DocumentSection::Content(content) = &mut ast.sections[0] {
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
