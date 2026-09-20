use parking_lot::Mutex;
use std::sync::Arc;
use std::num::NonZeroUsize;
use typst::introspection::PagedPosition;
use typst::layout::{Abs, Frame, FrameItem, Point};
use typst_layout::PagedDocument;
use typst::syntax::{Source, SyntaxKind};
use typst_ide::{jump_from_click, jump_from_cursor, Jump};

use crate::compilation_types::SourceRevision;
use crate::document_session::{FieldSourceMapEntry, SourceMapEntry};
use crate::path_utils::{file_id_for_virtual_path, path_from_file_id};
use crate::preview_sync_lookup::{
    candidate_offsets, field_entries_for_target, field_entry_for_content_blocks_caret,
    field_entry_for_offset,
    focus_target_for_field_offset, local_caret_in_content_block_entry, preview_position,
    source_entry_for_offset, source_offset_for_caret,
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
            .pages()
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

        let Some(page) = preview.document.pages().get(page_number.saturating_sub(1)) else {
            return PreviewJumpResult::NoMatch {
                source_revision: Some(preview.source_revision),
                reason: "Preview page is not available".to_string(),
            };
        };

        let main_id = file_id_for_virtual_path("main.typ");
        let world = SnapshotWorld::new(preview.source_snapshot.clone(), main_id);
        let point = Point::new(Abs::pt(x_pt), Abs::pt(y_pt));

        let Some(page_index) = NonZeroUsize::new(page_number) else {
            return PreviewJumpResult::NoMatch {
                source_revision: Some(preview.source_revision),
                reason: "Preview page is not available".to_string(),
            };
        };
        let _ = page;
        let position = PagedPosition { page: page_index, point };

        match jump_from_click(&world, &*preview.document, &position) {
            Some(Jump::File(file_id, offset)) => {
                let file_path = path_from_file_id(file_id);
                if let Some(entry) =
                    field_entry_for_offset(&preview.field_source_map, &file_path, offset)
                {
                    return PreviewJumpResult::Field {
                        target: focus_target_for_field_offset(
                            entry,
                            &preview.field_source_map,
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
                    reason: message.to_string(),
                };
            }
        };

        let mut positions = Vec::new();
        for offset in candidate_offsets(source.text(), entry.byte_start, entry.byte_end) {
            let next = jump_from_cursor(&*preview.document, &source, offset)
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
        let entry_refs: Vec<_> = entries.iter().copied().collect();
        let Some(entry) =
            field_entry_for_content_blocks_caret(&entry_refs, target.caret_utf16_offset)
        else {
            return self.positions_for_element(&target.element_id, source_revision);
        };
        let caret_in_entry = if entry_refs.len() > 1 {
            target.caret_utf16_offset.map(|global| {
                local_caret_in_content_block_entry(entry, &entry_refs, global)
            })
        } else {
            target.caret_utf16_offset
        };

        let source = match preview.source_snapshot.source_for_path(&entry.file_path) {
            Ok(source) => source,
            Err(message) => {
                return PreviewElementPositionsResult::Unavailable {
                    source_revision: Some(preview.source_revision),
                    reason: message.to_string(),
                };
            }
        };

        let mut positions = match caret_in_entry {
            Some(caret_utf16_offset) => match source_offset_for_caret(entry, caret_utf16_offset) {
                Some(preferred_offset) => roundtrip_positions_for_field_caret(
                    &preview,
                    entry,
                    &source,
                    &target.element_id,
                    caret_utf16_offset,
                    field_id,
                    target.caret_utf16_offset.unwrap_or(caret_utf16_offset),
                    preferred_offset,
                    target.anchor_page_number,
                ),
                None => Vec::new(),
            },
            None => {
                let preferred_offset = entry
                    .segments
                    .first()
                    .map(|segment| segment.source_byte_start)
                    .unwrap_or(entry.byte_start);

                positions_for_field_entry(
                    &preview,
                    entry,
                    &source,
                    &target.element_id,
                    field_id,
                    preferred_offset,
                    target.anchor_page_number,
                )
            }
        };

        // A field can occupy several source spots: e.g. the title is emitted both
        // as `#set document(title: …)` metadata, which renders nowhere, and as the
        // rendered front-matter title. The closest entry can be the non-rendering
        // one, so if it didn't resolve, try the field's other entries with the same
        // caret before giving up.
        if positions.is_empty() {
            if let Some(global_caret) = target.caret_utf16_offset {
                for &candidate in &entry_refs {
                    if std::ptr::eq(candidate, entry) {
                        continue;
                    }
                    let Ok(candidate_source) =
                        preview.source_snapshot.source_for_path(&candidate.file_path)
                    else {
                        continue;
                    };
                    let local_caret = if entry_refs.len() > 1 {
                        local_caret_in_content_block_entry(candidate, &entry_refs, global_caret)
                    } else {
                        global_caret
                    };
                    let Some(preferred_offset) = source_offset_for_caret(candidate, local_caret)
                    else {
                        continue;
                    };
                    positions = roundtrip_positions_for_field_caret(
                        &preview,
                        candidate,
                        &candidate_source,
                        &target.element_id,
                        local_caret,
                        field_id,
                        global_caret,
                        preferred_offset,
                        target.anchor_page_number,
                    );
                    if !positions.is_empty() {
                        break;
                    }
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
    preferred_offset: usize,
    anchor_page_number: Option<usize>,
) -> Vec<PreviewElementPosition> {
    let mut offsets = vec![preferred_offset];
    offsets.extend(
        candidate_offsets(source.text(), entry.byte_start, entry.byte_end)
            .into_iter()
            .filter(|offset| *offset != preferred_offset),
    );
    offsets.dedup();

    let mut candidates = Vec::new();
    for offset in offsets {
        candidates.extend(
            jump_from_cursor(&*preview.document, source, offset)
                .into_iter()
                .map(|position| {
                    (
                        preview_position(
                            position,
                            Some(element_id.to_string()),
                            Some(field_id.to_string()),
                            None,
                            preview.source_revision,
                        ),
                        offset,
                    )
                }),
        );
    }

    pick_closest_preview_position(candidates, preferred_offset, anchor_page_number)
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
    roundtrip_caret_utf16_offset: usize,
    response_field_id: &str,
    response_caret_utf16_offset: usize,
    preferred_source_offset: usize,
    anchor_page_number: Option<usize>,
) -> Vec<PreviewElementPosition> {
    let source_targets = caret_source_targets(entry, roundtrip_caret_utf16_offset);
    if source_targets.is_empty() {
        return Vec::new();
    }

    let main_id = file_id_for_virtual_path("main.typ");
    let world = SnapshotWorld::new(preview.source_snapshot.clone(), main_id);
    let mut candidates = Vec::new();

    for (index, page) in preview.document.pages().iter().enumerate() {
        let page_number = index + 1;
        for target in &source_targets {
            for candidate in click_candidates_for_source_targets(
                &page.frame,
                source,
                std::slice::from_ref(target),
                Point::zero(),
            ) {
                if !candidate_roundtrips_to_focus(
                    preview,
                    &world,
                    page_number,
                    candidate.point,
                    element_id,
                    response_field_id,
                    response_caret_utf16_offset,
                ) {
                    continue;
                }

                candidates.push((
                    PreviewElementPosition {
                        element_id: Some(element_id.to_string()),
                        field_id: Some(response_field_id.to_string()),
                        caret_utf16_offset: Some(response_caret_utf16_offset),
                        page_number,
                        x_pt: candidate.point.x.to_pt(),
                        y_pt: candidate.point.y.to_pt(),
                        caret_cue: Some(PreviewCaretCue {
                            top_y_pt: candidate.top_y.to_pt(),
                            height_pt: candidate.height.to_pt(),
                        }),
                        source_revision: preview.source_revision,
                    },
                    target.source_byte_offset,
                ));
            }
        }
    }

    collect_caret_positions(candidates, preferred_source_offset, anchor_page_number)
}

/// Every distinct rendered spot the caret maps to, ordered so the copy nearest
/// the anchor page comes first. Unlike [`pick_closest_preview_position`], which
/// keeps only that nearest copy, this returns them all — a field repeated across
/// the document (a title in the running head, a heading echoed in the outline)
/// renders the same caret in several places, and the multi-caret preview draws a
/// cue at each one. All candidates here already round-trip to the same focus, so
/// they are the *same* caret; only their rendered position differs.
fn collect_caret_positions(
    candidates: Vec<(PreviewElementPosition, usize)>,
    preferred_source_offset: usize,
    anchor_page_number: Option<usize>,
) -> Vec<PreviewElementPosition> {
    use std::collections::HashMap;

    // Collapse duplicate hits on the same rendered spot (the leading and trailing
    // boundary of one caret resolve to the same point), keeping the closest
    // source offset. Quantize the point so floating-point jitter doesn't split a
    // spot in two.
    let mut best: HashMap<(usize, i64, i64), (PreviewElementPosition, usize)> = HashMap::new();
    for (position, offset) in candidates {
        let key = (
            position.page_number,
            (position.x_pt * 100.0).round() as i64,
            (position.y_pt * 100.0).round() as i64,
        );
        let distance = offset.abs_diff(preferred_source_offset);
        match best.get(&key) {
            Some((_, existing_offset))
                if existing_offset.abs_diff(preferred_source_offset) <= distance => {}
            _ => {
                best.insert(key, (position, offset));
            }
        }
    }

    let mut positions: Vec<(PreviewElementPosition, usize)> = best.into_values().collect();
    positions.sort_by(|left, right| {
        page_distance_from_anchor(left.0.page_number, anchor_page_number)
            .cmp(&page_distance_from_anchor(
                right.0.page_number,
                anchor_page_number,
            ))
            .then_with(|| {
                left.1
                    .abs_diff(preferred_source_offset)
                    .cmp(&right.1.abs_diff(preferred_source_offset))
            })
            .then_with(|| left.0.page_number.cmp(&right.0.page_number))
            .then_with(|| {
                left.0
                    .y_pt
                    .partial_cmp(&right.0.y_pt)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| {
                left.0
                    .x_pt
                    .partial_cmp(&right.0.x_pt)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });
    positions
        .into_iter()
        .map(|(position, _)| position)
        .collect()
}

fn page_distance_from_anchor(page_number: usize, anchor_page_number: Option<usize>) -> usize {
    match anchor_page_number {
        Some(anchor) => page_number.abs_diff(anchor),
        None => 0,
    }
}

fn pick_closest_preview_position(
    candidates: Vec<(PreviewElementPosition, usize)>,
    preferred_source_offset: usize,
    anchor_page_number: Option<usize>,
) -> Vec<PreviewElementPosition> {
    let Some((position, _)) = candidates.into_iter().min_by(|left, right| {
        let left_source = left.1.abs_diff(preferred_source_offset);
        let right_source = right.1.abs_diff(preferred_source_offset);
        left_source
            .cmp(&right_source)
            .then_with(|| {
                page_distance_from_anchor(left.0.page_number, anchor_page_number).cmp(
                    &page_distance_from_anchor(right.0.page_number, anchor_page_number),
                )
            })
            .then_with(|| {
                left.0
                    .y_pt
                    .partial_cmp(&right.0.y_pt)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    }) else {
        return Vec::new();
    };

    vec![position]
}

fn caret_source_targets(
    entry: &FieldSourceMapEntry,
    caret_utf16_offset: usize,
) -> Vec<CaretSourceTarget> {
    let mut targets = Vec::new();

    if caret_utf16_offset == 0 {
        if let Some(segment) = entry.segments.first() {
            targets.push(CaretSourceTarget {
                source_byte_offset: segment.source_byte_start,
                boundary: CaretClickBoundary::Leading,
            });
        } else if entry.fallback_caret_utf16_offset == Some(caret_utf16_offset) {
            targets.push(CaretSourceTarget {
                source_byte_offset: entry.byte_start,
                boundary: CaretClickBoundary::Leading,
            });
        }
        return targets;
    }

    for segment in &entry.segments {
        if caret_utf16_offset == segment.field_utf16_end {
            targets.push(CaretSourceTarget {
                source_byte_offset: segment.source_byte_end,
                boundary: CaretClickBoundary::Trailing,
            });
            break;
        }
    }

    if targets.is_empty() && entry.fallback_caret_utf16_offset == Some(caret_utf16_offset) {
        targets.push(CaretSourceTarget {
            source_byte_offset: entry.byte_start,
            boundary: CaretClickBoundary::Leading,
        });
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
                                    Some(glyph_pos.x)
                                }
                                CaretClickBoundary::Trailing
                                    if target.source_byte_offset >= glyph_start
                                        && target.source_byte_offset <= glyph_end =>
                                {
                                    // Keep the dot slightly inside the glyph's ink box:
                                    // Typst click targets miss when the point sits past the
                                    // glyph's advance width.
                                    Some(glyph_pos.x + width * 0.995)
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
    let Some(page) = preview.document.pages().get(page_number.saturating_sub(1)) else {
        return false;
    };

    let _ = page;
    let Some(page_index) = NonZeroUsize::new(page_number) else {
        return false;
    };
    let position = PagedPosition { page: page_index, point };
    let Some(Jump::File(file_id, offset)) =
        jump_from_click(world, &*preview.document, &position)
    else {
        return false;
    };

    let file_path = path_from_file_id(file_id);
    let Some(entry) = field_entry_for_offset(&preview.field_source_map, &file_path, offset) else {
        return false;
    };

    let target = focus_target_for_field_offset(
        entry,
        &preview.field_source_map,
        preview.source_revision,
        offset,
    );
    target.element_id == element_id
        && target.field_id.as_deref() == Some(field_id)
        && target.caret_utf16_offset == Some(caret_utf16_offset)
}

#[cfg(test)]
#[allow(irrefutable_let_patterns)]
#[path = "preview_sync_tests.rs"]
mod tests;
