use crate::document_source_builder::SourceBuilder;
use crate::template_spec::{ElementOverrideSpec, TemplateSpec};

use super::custom_fields::{figure_body_field_id, push_override_extra_fields};
use super::paths::figure_caption_field_id;
use super::{escape_typst_string, format_typst_length, push_wrapper_symbol_import};

/// Typst function used to wrap table and image elements (defaults to `figure`).
pub(crate) fn element_figure_wrapper_name(over: Option<&ElementOverrideSpec>) -> &str {
    if let Some(spec) = over {
        if let Some(wrapper) = spec.wrapper.as_deref() {
            if !wrapper.is_empty() {
                return wrapper;
            }
        }
        if let Some(function) = spec.function.as_deref() {
            if !function.is_empty() {
                return function;
            }
        }
    }
    "figure"
}

pub(crate) fn uses_standard_typst_figure(wrapper: &str) -> bool {
    wrapper == "figure"
}

/// Emit `#wrapper(...)` for template-specific wrappers such as `apa-figure`.

/// Emit `#wrapper(...)` for template-specific wrappers such as `apa-figure`.
pub(crate) fn figure_image_typst_source(
    path: &str,
    extra_fields: &std::collections::HashMap<String, serde_json::Value>,
) -> String {
    let escaped = escape_typst_string(path);
    if let Some(serde_json::Value::String(width)) = extra_fields.get("width") {
        if let Some(length) = format_typst_length(width) {
            return format!("image(\"{escaped}\", width: {length})");
        }
    }
    format!("image(\"{escaped}\")")
}

/// The body (`#image`, `table(...)`, or rich text) is a direct argument — never wrapped
/// in Typst's built-in `#figure(...)`.

/// The body (`#image`, `table(...)`, or rich text) is a direct argument — never wrapped
/// in Typst's built-in `#figure(...)`.
pub(crate) fn push_custom_wrapper_figure_element(
    builder: &mut SourceBuilder,
    template: &TemplateSpec,
    wrapper: &str,
    element_id: &str,
    override_spec: Option<&ElementOverrideSpec>,
    body: SourceBuilder,
    asset_path: Option<&str>,
    caption: &str,
    extra_fields: &std::collections::HashMap<String, serde_json::Value>,
    skip_extra_keys: &[&str],
) {
    push_wrapper_symbol_import(template, wrapper, builder);
    builder.push_literal(&format!("#{wrapper}(\n"));

    if let Some(path) = asset_path {
        let image_source = figure_image_typst_source(path, extra_fields);
        builder.push_literal("  ");
        builder.push_generated_field_marker(
            element_id,
            &figure_body_field_id(element_id),
            &image_source,
            0,
        );
        builder.push_literal("\n");
    } else if body.source.trim().is_empty() {
        builder.push_literal("  ");
        builder.push_generated_field_marker(
            element_id,
            &figure_body_field_id(element_id),
            "Figure content",
            0,
        );
        builder.push_literal("\n");
    } else {
        builder.push_literal("  ");
        builder.push_builder(body);
        builder.push_literal("\n");
    }

    if !caption.is_empty() {
        builder.push_literal(",\n  caption: [");
        builder.push_escaped_field(element_id, &figure_caption_field_id(element_id), caption, 0);
        builder.push_literal("]\n");
    }

    push_override_extra_fields(
        builder,
        element_id,
        override_spec,
        extra_fields,
        skip_extra_keys,
    );

    builder.push_literal(")\n");
}
