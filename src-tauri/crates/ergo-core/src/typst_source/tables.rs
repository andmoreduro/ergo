use super::is_sized_unit;

pub(crate) fn sanitize_table_column_size(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed == "auto" || is_sized_unit(trimmed) {
        trimmed.to_string()
    } else {
        "1fr".to_string()
    }
}

/// Maps editor placement values to Typst `figure` placement arguments.
///
/// Érgo uses `"here"` for in-flow placement; Typst expects `none`. Omitting the
/// argument would inherit template defaults (e.g. APA sets `placement: auto`).
pub(crate) fn typst_placement_arg(value: &str) -> Option<&'static str> {
    match value.trim() {
        "top" => Some("top"),
        "bottom" => Some("bottom"),
        "auto" => Some("auto"),
        "here" | "" => Some("none"),
        _ => None,
    }
}

pub(crate) fn table_placement_value(table: &crate::ast::Table) -> &str {
    table
        .extra_fields
        .get("placement")
        .and_then(|value| value.as_str())
        .unwrap_or("here")
}

/// Opening delimiter for a Typst table cell, including `table.cell` when spans apply.
pub(crate) fn table_cell_open(col_span: Option<i32>, row_span: Option<i32>) -> String {
    let colspan = col_span.unwrap_or(1).max(1);
    let rowspan = row_span.unwrap_or(1).max(1);
    let mut attrs = Vec::new();
    if colspan > 1 {
        attrs.push(format!("colspan: {colspan}"));
    }
    if rowspan > 1 {
        attrs.push(format!("rowspan: {rowspan}"));
    }
    if attrs.is_empty() {
        "[".to_string()
    } else {
        format!("table.cell({})[", attrs.join(", "))
    }
}

#[cfg(test)]
mod tests {
    use super::typst_placement_arg;

    #[test]
    fn here_maps_to_typst_none() {
        assert_eq!(typst_placement_arg("here"), Some("none"));
        assert_eq!(typst_placement_arg(""), Some("none"));
    }

    #[test]
    fn floating_placements_map_directly() {
        assert_eq!(typst_placement_arg("top"), Some("top"));
        assert_eq!(typst_placement_arg("bottom"), Some("bottom"));
        assert_eq!(typst_placement_arg("auto"), Some("auto"));
    }

    #[test]
    fn unknown_placement_is_omitted() {
        assert_eq!(typst_placement_arg("h"), None);
    }
}
