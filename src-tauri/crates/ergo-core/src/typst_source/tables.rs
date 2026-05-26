use super::is_sized_unit;

pub(crate) fn sanitize_table_column_size(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed == "auto" || is_sized_unit(trimmed) {
        trimmed.to_string()
    } else {
        "1fr".to_string()
    }
}

pub(crate) fn typst_placement_arg(value: &str) -> Option<&'static str> {
    match value.trim() {
        "top" => Some("top"),
        "bottom" => Some("bottom"),
        "auto" => Some("auto"),
        "here" | "" => None,
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
