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

pub(crate) fn field_entries_for_target<'a>(
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

pub(crate) fn focus_target_for_field_offset(
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

pub(crate) fn source_offset_for_caret(
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
