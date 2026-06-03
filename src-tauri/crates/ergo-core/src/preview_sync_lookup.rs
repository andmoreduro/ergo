use typst::layout::Position;

use crate::compilation_types::SourceRevision;
use crate::document_session::{FieldSourceMapEntry, SourceMapEntry};
use crate::preview_sync_types::{PreviewElementPosition, PreviewFocusTarget};

pub(crate) fn preview_position(
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
        caret_cue: None,
        source_revision,
    }
}

pub(crate) fn source_entry_for_offset<'a>(
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

pub(crate) fn field_entry_for_offset<'a>(
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

pub(crate) fn caret_utf16_distance_to_entry(
    entry: &FieldSourceMapEntry,
    caret_utf16_offset: usize,
) -> usize {
    let mut best = usize::MAX;

    for segment in &entry.segments {
        if caret_utf16_offset >= segment.field_utf16_start
            && caret_utf16_offset <= segment.field_utf16_end
        {
            return 0;
        }

        best = best
            .min(caret_utf16_offset.abs_diff(segment.field_utf16_start))
            .min(caret_utf16_offset.abs_diff(segment.field_utf16_end));
    }

    if best != usize::MAX {
        return best;
    }

    entry
        .fallback_caret_utf16_offset
        .map(|offset| caret_utf16_offset.abs_diff(offset))
        .unwrap_or(usize::MAX)
}

pub(crate) fn field_entry_closest_to_caret<'a>(
    entries: &[&'a FieldSourceMapEntry],
    caret_utf16_offset: Option<usize>,
) -> Option<&'a FieldSourceMapEntry> {
    if entries.is_empty() {
        return None;
    }

    let Some(caret_utf16_offset) = caret_utf16_offset else {
        return entries
            .iter()
            .copied()
            .find(|entry| !entry.segments.is_empty())
            .or_else(|| entries.first().copied());
    };

    entries
        .iter()
        .copied()
        .min_by_key(|entry| caret_utf16_distance_to_entry(entry, caret_utf16_offset))
}

fn paragraph_index_from_field_id(field_id: &str) -> Option<usize> {
    let path = field_id.strip_prefix('/')?;
    let mut parts = path.split('/');
    parts.next()?;
    let index = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some(index)
}

fn is_indexed_content_block_field_id(field_id: &str) -> bool {
    paragraph_index_from_field_id(field_id).is_some()
}

/// `/abstract_es/2` → `/abstract_es` for `content_blocks` inputs.
pub(crate) fn parent_field_id_for_indexed_content_block(field_id: &str) -> Option<String> {
    paragraph_index_from_field_id(field_id)?;
    let key = field_id.strip_prefix('/')?.split('/').next()?;
    Some(format!("/{key}"))
}

pub(crate) fn global_caret_for_indexed_entry(
    entry: &FieldSourceMapEntry,
    entries: &[&FieldSourceMapEntry],
    local_caret: usize,
) -> usize {
    let index = paragraph_index_from_field_id(&entry.field_id).unwrap_or(0);
    global_offset_before_paragraph_index(entries, index) + local_caret
}

fn field_utf16_length(entry: &FieldSourceMapEntry) -> usize {
    entry
        .segments
        .iter()
        .map(|segment| segment.field_utf16_end)
        .max()
        .unwrap_or(0)
        .max(entry.fallback_caret_utf16_offset.unwrap_or(0))
}

fn max_paragraph_index(entries: &[&FieldSourceMapEntry]) -> usize {
    entries
        .iter()
        .filter_map(|entry| paragraph_index_from_field_id(&entry.field_id))
        .max()
        .unwrap_or(0)
}

fn entry_for_paragraph_index<'a>(
    entries: &[&'a FieldSourceMapEntry],
    index: usize,
) -> Option<&'a FieldSourceMapEntry> {
    entries
        .iter()
        .copied()
        .find(|entry| paragraph_index_from_field_id(&entry.field_id) == Some(index))
}

fn paragraph_utf16_length(entries: &[&FieldSourceMapEntry], index: usize) -> usize {
    entry_for_paragraph_index(entries, index)
        .map(field_utf16_length)
        .unwrap_or(0)
}

/// Global UTF-16 offset before `target_index`, including empty paragraph slots.
fn global_offset_before_paragraph_index(
    entries: &[&FieldSourceMapEntry],
    target_index: usize,
) -> usize {
    (0..target_index)
        .map(|index| paragraph_utf16_length(entries, index))
        .sum()
}

/// Map a global caret (ParagraphsField) to a paragraph entry, matching the editor's
/// block-boundary rule: at the end of a block, prefer the start of the next block.
fn field_entry_for_indexed_content_blocks_caret<'a>(
    entries: &[&'a FieldSourceMapEntry],
    global_caret: usize,
) -> Option<&'a FieldSourceMapEntry> {
    let max_index = max_paragraph_index(entries);
    let mut offset = 0usize;

    for index in 0..=max_index {
        let length = paragraph_utf16_length(entries, index);

        if global_caret < offset + length {
            return entry_for_paragraph_index(entries, index);
        }

        if global_caret == offset + length && index < max_index {
            offset += length;
            continue;
        }

        if global_caret == offset + length {
            return entry_for_paragraph_index(entries, index);
        }

        offset += length;
    }

    entry_for_paragraph_index(entries, max_index)
        .or_else(|| entries.last().copied())
}

pub(crate) fn field_entries_for_target<'a>(
    field_source_map: &'a [FieldSourceMapEntry],
    target: &PreviewFocusTarget,
) -> Vec<&'a FieldSourceMapEntry> {
    let Some(field_id) = target.field_id.as_deref() else {
        return Vec::new();
    };

    let exact: Vec<_> = field_source_map
        .iter()
        .filter(|entry| entry.element_id == target.element_id && entry.field_id == field_id)
        .collect();

    if !exact.is_empty() {
        return exact;
    }

    // `content_blocks` inputs register one source-map field per paragraph (`/id/0`, …)
    // while the editor focuses the parent path (`/id`).
    if field_id.starts_with('/') && field_id[1..].contains('/') {
        return Vec::new();
    }

    field_source_map
        .iter()
        .filter(|entry| {
            entry.element_id == target.element_id
                && entry
                    .field_id
                    .strip_prefix(field_id)
                    .is_some_and(|suffix| {
                        suffix.starts_with('/')
                            && suffix[1..]
                                .chars()
                                .all(|character| character.is_ascii_digit())
                    })
        })
        .collect()
}

pub(crate) fn field_entry_for_content_blocks_caret<'a>(
    entries: &[&'a FieldSourceMapEntry],
    caret_utf16_offset: Option<usize>,
) -> Option<&'a FieldSourceMapEntry> {
    if entries.is_empty() {
        return None;
    }

    if entries.len() == 1 {
        return field_entry_closest_to_caret(entries, caret_utf16_offset);
    }

    let all_indexed = entries
        .iter()
        .all(|entry| is_indexed_content_block_field_id(&entry.field_id));
    if !all_indexed {
        return field_entry_closest_to_caret(entries, caret_utf16_offset);
    }

    let Some(global_caret) = caret_utf16_offset else {
        return entries
            .iter()
            .copied()
            .min_by_key(|entry| paragraph_index_from_field_id(&entry.field_id).unwrap_or(0));
    };

    field_entry_for_indexed_content_blocks_caret(entries, global_caret)
}

pub(crate) fn local_caret_in_content_block_entry(
    entry: &FieldSourceMapEntry,
    entries: &[&FieldSourceMapEntry],
    global_caret: usize,
) -> usize {
    let index = paragraph_index_from_field_id(&entry.field_id).unwrap_or(0);
    let start = global_offset_before_paragraph_index(entries, index);
    global_caret.saturating_sub(start)
}

pub(crate) fn focus_target_for_field_offset(
    entry: &FieldSourceMapEntry,
    field_source_map: &[FieldSourceMapEntry],
    source_revision: SourceRevision,
    offset: usize,
) -> PreviewFocusTarget {
    let local_caret = caret_for_source_offset(entry, offset);

    if let Some(parent_field_id) = parent_field_id_for_indexed_content_block(&entry.field_id) {
        let focus_target = PreviewFocusTarget {
            element_id: entry.element_id.clone(),
            field_id: Some(parent_field_id.clone()),
            caret_utf16_offset: None,
            anchor_page_number: None,
            source_revision,
        };
        let sibling_entries: Vec<_> = field_entries_for_target(field_source_map, &focus_target);
        let sibling_refs: Vec<_> = sibling_entries.iter().copied().collect();
        let global_caret = local_caret.map(|local| {
            global_caret_for_indexed_entry(entry, &sibling_refs, local)
        });

        return PreviewFocusTarget {
            element_id: entry.element_id.clone(),
            field_id: Some(parent_field_id),
            caret_utf16_offset: global_caret,
            anchor_page_number: None,
            source_revision,
        };
    }

    PreviewFocusTarget {
        element_id: entry.element_id.clone(),
        field_id: Some(entry.field_id.clone()),
        caret_utf16_offset: local_caret,
        anchor_page_number: None,
        source_revision,
    }
}

fn caret_for_source_offset(entry: &FieldSourceMapEntry, offset: usize) -> Option<usize> {
    for segment in &entry.segments {
        if offset == segment.source_byte_end {
            return Some(segment.field_utf16_end);
        }
    }

    for segment in &entry.segments {
        if offset == segment.source_byte_start {
            return Some(segment.field_utf16_start);
        }
    }

    for segment in &entry.segments {
        if offset > segment.source_byte_start && offset < segment.source_byte_end {
            return Some(segment.field_utf16_end);
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

pub(crate) fn source_offset_for_caret(
    entry: &FieldSourceMapEntry,
    caret_utf16_offset: usize,
) -> Option<usize> {
    // Editor caret offsets follow UTF-16 indices: offset N sits immediately after the
    // code units with indices < N. Map that to the trailing source edge of the segment
    // whose field range ends at N, not the leading edge of the next segment.
    for segment in &entry.segments {
        if caret_utf16_offset == segment.field_utf16_end {
            return Some(segment.source_byte_end);
        }
    }

    if caret_utf16_offset == 0 {
        return entry
            .segments
            .first()
            .map(|segment| segment.source_byte_start)
            .or_else(|| {
                entry
                    .fallback_caret_utf16_offset
                    .filter(|fallback| *fallback == caret_utf16_offset)
                    .map(|_| entry.byte_start)
            });
    }

    entry
        .fallback_caret_utf16_offset
        .filter(|fallback| *fallback == caret_utf16_offset)
        .map(|_| entry.byte_start)
}

pub(crate) fn candidate_offsets(text: &str, start: usize, end: usize) -> Vec<usize> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document_session_types::{FieldSourceMapEntry, FieldTextSegment};

    fn test_entry(field_id: &str, utf16_len: usize) -> FieldSourceMapEntry {
        FieldSourceMapEntry {
            element_id: "inputs".to_string(),
            section_id: String::new(),
            field_id: field_id.to_string(),
            file_path: "main.typ".to_string(),
            byte_start: 0,
            byte_end: utf16_len.max(1),
            segments: vec![FieldTextSegment {
                source_byte_start: 0,
                source_byte_end: utf16_len.max(1),
                field_utf16_start: 0,
                field_utf16_end: utf16_len,
            }],
            fallback_caret_utf16_offset: None,
        }
    }

    fn as_refs(entries: &[FieldSourceMapEntry]) -> Vec<&FieldSourceMapEntry> {
        entries.iter().collect()
    }

    #[test]
    fn content_blocks_caret_skips_empty_paragraph_index_gaps() {
        let entries = vec![
            test_entry("/abstract_es/0", 1),
            test_entry("/abstract_es/2", 1),
        ];
        let refs = as_refs(&entries);

        let entry =
            field_entry_for_content_blocks_caret(&refs, Some(1)).expect("entry at global 1");
        assert_eq!(entry.field_id, "/abstract_es/2");
        assert_eq!(local_caret_in_content_block_entry(entry, &refs, 1), 0);
    }

    #[test]
    fn focus_target_for_indexed_content_block_uses_parent_field_id() {
        let entries = vec![
            test_entry("/abstract_es/0", 5),
            test_entry("/abstract_es/2", 3),
        ];
        let map: Vec<FieldSourceMapEntry> = entries.clone();

        let target = focus_target_for_field_offset(
            &entries[1],
            &map,
            1,
            entries[1].byte_start,
        );

        assert_eq!(target.field_id.as_deref(), Some("/abstract_es"));
        assert_eq!(target.caret_utf16_offset, Some(5));
    }

    #[test]
    fn content_blocks_caret_at_paragraph_boundary_prefers_next_block() {
        let entries = vec![
            test_entry("/abstract_es/0", 5),
            test_entry("/abstract_es/1", 0),
            test_entry("/abstract_es/2", 5),
        ];
        let refs = as_refs(&entries);

        let entry =
            field_entry_for_content_blocks_caret(&refs, Some(5)).expect("boundary caret");
        assert_eq!(entry.field_id, "/abstract_es/2");
    }
}
