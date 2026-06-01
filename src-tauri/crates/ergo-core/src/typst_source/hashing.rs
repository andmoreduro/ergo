use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use crate::ast::{DocumentElement, RichText};

pub(crate) fn hash_source(source: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    hasher.finish()
}
pub(crate) fn element_content_hash(element: &DocumentElement) -> u64 {
    let mut hasher = DefaultHasher::new();
    hash_document_element(element, &mut hasher);
    hasher.finish()
}

fn hash_document_element(element: &DocumentElement, hasher: &mut impl Hasher) {
    std::mem::discriminant(element).hash(hasher);
    match element {
        DocumentElement::Heading(h) => {
            h.id.hash(hasher);
            h.level.hash(hasher);
            hash_rich_text_slice(&h.content, hasher);
        }
        DocumentElement::Paragraph(p) => {
            p.id.hash(hasher);
            hash_rich_text_slice(&p.content, hasher);
        }
        DocumentElement::Quote(q) => {
            q.id.hash(hasher);
            hash_rich_text_slice(&q.content, hasher);
        }
        DocumentElement::List(l) => {
            l.id.hash(hasher);
            for item in &l.items {
                hash_rich_text_slice(item, hasher);
            }
        }
        DocumentElement::Enumeration(e) => {
            e.id.hash(hasher);
            for item in &e.items {
                hash_rich_text_slice(item, hasher);
            }
        }
        DocumentElement::Equation(e) => {
            e.id.hash(hasher);
            e.latex_source.hash(hasher);
            e.is_block.hash(hasher);
            e.syntax.hash(hasher);
        }
        DocumentElement::Table(t) => {
            t.id.hash(hasher);
            t.rows.hash(hasher);
            t.cols.hash(hasher);
            t.cells.len().hash(hasher);
            for row in &t.cells {
                row.len().hash(hasher);
                for cell in row {
                    hash_rich_text_slice(&cell.content, hasher);
                    cell.row_span.hash(hasher);
                    cell.col_span.hash(hasher);
                }
            }
            t.column_sizes.hash(hasher);
            hash_json_map(&t.extra_fields, hasher);
        }
        DocumentElement::Figure(f) => {
            f.id.hash(hasher);
            f.asset_id.hash(hasher);
            hash_document_element(&f.content, hasher);
            f.caption.hash(hasher);
            f.placement.hash(hasher);
            hash_json_map(&f.extra_fields, hasher);
        }
        DocumentElement::Diagram(d) => {
            d.id.hash(hasher);
            d.mermaid_source.hash(hasher);
            d.asset_id.hash(hasher);
            d.caption.hash(hasher);
            d.placement.hash(hasher);
            hash_json_map(&d.extra_fields, hasher);
        }
        DocumentElement::Custom(c) => {
            c.id.hash(hasher);
            c.element_type.hash(hasher);
            hash_json_map(&c.fields, hasher);
        }
    }
}

fn hash_rich_text_slice(content: &[RichText], hasher: &mut impl Hasher) {
    content.len().hash(hasher);
    for rt in content {
        rt.text.hash(hasher);
        rt.bold.hash(hasher);
        rt.italic.hash(hasher);
        rt.underline.hash(hasher);
        rt.kind.hash(hasher);
        rt.reference_id.hash(hasher);
        rt.equation_source.hash(hasher);
        rt.equation_syntax.hash(hasher);
    }
}

fn hash_json_map(
    map: &std::collections::HashMap<String, serde_json::Value>,
    hasher: &mut impl Hasher,
) {
    map.len().hash(hasher);
    let mut keys: Vec<&String> = map.keys().collect();
    keys.sort();
    for key in keys {
        key.hash(hasher);
        hash_json_value(&map[key], hasher);
    }
}

fn hash_json_value(value: &serde_json::Value, hasher: &mut impl Hasher) {
    std::mem::discriminant(value).hash(hasher);
    match value {
        serde_json::Value::Null => {}
        serde_json::Value::Bool(b) => b.hash(hasher),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                0u8.hash(hasher);
                i.hash(hasher);
            } else if let Some(u) = n.as_u64() {
                1u8.hash(hasher);
                u.hash(hasher);
            } else if let Some(f) = n.as_f64() {
                2u8.hash(hasher);
                f.to_bits().hash(hasher);
            }
        }
        serde_json::Value::String(s) => s.hash(hasher),
        serde_json::Value::Array(arr) => {
            arr.len().hash(hasher);
            for item in arr {
                hash_json_value(item, hasher);
            }
        }
        serde_json::Value::Object(map) => {
            map.len().hash(hasher);
            for (k, v) in map {
                k.hash(hasher);
                hash_json_value(v, hasher);
            }
        }
    }
}
