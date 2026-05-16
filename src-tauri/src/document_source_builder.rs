use crate::document_session_types::{FieldSourceMapEntry, FieldTextSegment};

#[derive(Clone, Debug)]
struct LocalFieldSourceMapEntry {
    element_id: String,
    field_id: String,
    byte_start: usize,
    byte_end: usize,
    segments: Vec<FieldTextSegment>,
    fallback_caret_utf16_offset: Option<usize>,
}

#[derive(Default)]
pub(crate) struct SourceBuilder {
    pub(crate) source: String,
    field_ranges: Vec<LocalFieldSourceMapEntry>,
}

impl SourceBuilder {
    pub(crate) fn push_literal(&mut self, value: &str) {
        self.source.push_str(value);
    }

    pub(crate) fn clear(&mut self) {
        self.source.clear();
        self.field_ranges.clear();
    }

    pub(crate) fn push_builder(&mut self, mut other: SourceBuilder) {
        let base = self.source.len();
        self.source.push_str(&other.source);
        for entry in &mut other.field_ranges {
            entry.byte_start += base;
            entry.byte_end += base;
            for segment in &mut entry.segments {
                segment.source_byte_start += base;
                segment.source_byte_end += base;
            }
        }
        self.field_ranges.extend(other.field_ranges);
    }

    pub(crate) fn push_escaped_field(
        &mut self,
        element_id: &str,
        field_id: &str,
        value: &str,
        field_utf16_start: usize,
    ) {
        self.push_field(element_id, field_id, value, field_utf16_start, true);
    }

    pub(crate) fn push_raw_field(
        &mut self,
        element_id: &str,
        field_id: &str,
        value: &str,
        field_utf16_start: usize,
    ) {
        self.push_field(element_id, field_id, value, field_utf16_start, false);
    }

    pub(crate) fn push_generated_field_marker(
        &mut self,
        element_id: &str,
        field_id: &str,
        generated: &str,
        fallback_caret_utf16_offset: usize,
    ) {
        let byte_start = self.source.len();
        self.source.push_str(generated);
        let byte_end = self.source.len();
        self.field_ranges.push(LocalFieldSourceMapEntry {
            element_id: element_id.to_string(),
            field_id: field_id.to_string(),
            byte_start,
            byte_end,
            segments: Vec::new(),
            fallback_caret_utf16_offset: Some(fallback_caret_utf16_offset),
        });
    }

    pub(crate) fn into_absolute_field_ranges(
        self,
        section_id: &str,
        file_path: &str,
        section_byte_start: usize,
    ) -> Vec<FieldSourceMapEntry> {
        self.field_ranges
            .into_iter()
            .map(|entry| FieldSourceMapEntry {
                element_id: entry.element_id,
                section_id: section_id.to_string(),
                field_id: entry.field_id,
                file_path: file_path.to_string(),
                byte_start: section_byte_start + entry.byte_start,
                byte_end: section_byte_start + entry.byte_end,
                segments: entry
                    .segments
                    .into_iter()
                    .map(|segment| FieldTextSegment {
                        source_byte_start: section_byte_start + segment.source_byte_start,
                        source_byte_end: section_byte_start + segment.source_byte_end,
                        field_utf16_start: segment.field_utf16_start,
                        field_utf16_end: segment.field_utf16_end,
                    })
                    .collect(),
                fallback_caret_utf16_offset: entry.fallback_caret_utf16_offset,
            })
            .collect()
    }

    fn push_field(
        &mut self,
        element_id: &str,
        field_id: &str,
        value: &str,
        field_utf16_start: usize,
        escape: bool,
    ) {
        let byte_start = self.source.len();
        let mut segments = Vec::new();
        let mut utf16_offset = field_utf16_start;

        for character in value.chars() {
            let source_byte_start = self.source.len();
            if escape && should_escape_typst_text_character(character) {
                self.source.push('\\');
            }
            self.source.push(character);
            let source_byte_end = self.source.len();
            let next_utf16_offset = utf16_offset + character.len_utf16();
            segments.push(FieldTextSegment {
                source_byte_start,
                source_byte_end,
                field_utf16_start: utf16_offset,
                field_utf16_end: next_utf16_offset,
            });
            utf16_offset = next_utf16_offset;
        }

        self.field_ranges.push(LocalFieldSourceMapEntry {
            element_id: element_id.to_string(),
            field_id: field_id.to_string(),
            byte_start,
            byte_end: self.source.len(),
            segments,
            fallback_caret_utf16_offset: Some(field_utf16_start),
        });
    }
}

fn should_escape_typst_text_character(character: char) -> bool {
    matches!(
        character,
        '\\' | '#' | '$' | '%' | '&' | '_' | '^' | '{' | '}' | '[' | ']'
    )
}
