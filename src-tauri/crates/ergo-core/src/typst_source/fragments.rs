use std::collections::HashMap;

use crate::ast::{AssetEntry, DocumentElement, ReferenceEntry};
use crate::document_session_types::{GeneratedFragment, SourceMapEntry};
use crate::document_source_builder::SourceBuilder;
use crate::template_spec::TemplateSpec;

use super::custom_fields::{
    figure_body_field_id, format_json_val_for_custom_field, push_override_extra_fields,
};
use super::figures::{
    element_figure_wrapper_name, figure_image_typst_source, push_custom_wrapper_figure_element,
    uses_standard_typst_figure,
};
use super::hashing::hash_source;
use super::paths::{
    asset_path_relative_to_element, element_id, element_kind, equation_source_field_id,
    figure_caption_field_id, label_for_id, path_id_for_id, rich_text_field_id, table_cell_field_id,
};
use super::push_wrapper_symbol_import;
use super::references::bibliography_citation_keys;
use super::rich_text::{normalize_math_source, push_rich_text_field};
use super::tables::{sanitize_table_column_size, table_placement_value, typst_placement_arg};

pub(crate) fn element_fragment(
    element: &DocumentElement,
    section_id: &str,
    file_path: &str,
    section_byte_start: usize,
    section_char_start: usize,
    template: &TemplateSpec,
    assets: &[AssetEntry],
    references: &[ReferenceEntry],
) -> GeneratedFragment {
    let element_id = element_id(element);
    let kind = element_kind(element);
    let label = label_for_id(&element_id);
    let bibliography_keys = bibliography_citation_keys(references);
    let builder =
        generate_element_typst(element, &label, template, assets, &bibliography_keys, true);
    let source = builder.source.clone();
    let field_source_map_ranges =
        builder.into_absolute_field_ranges(section_id, file_path, section_byte_start);
    let source_map_ranges = if source.is_empty() {
        Vec::new()
    } else {
        vec![SourceMapEntry {
            element_id: element_id.clone(),
            section_id: section_id.to_string(),
            file_path: file_path.to_string(),
            start: section_char_start,
            end: section_char_start + source.chars().count(),
            byte_start: section_byte_start,
            byte_end: section_byte_start + source.len(),
            label,
            page: None,
        }]
    };

    GeneratedFragment {
        element_id,
        section_id: section_id.to_string(),
        kind: kind.to_string(),
        source_hash: hash_source(&source),
        source,
        dependencies: Vec::new(),
        source_map_ranges,
        field_source_map_ranges,
    }
}

pub(crate) fn resource_preview_typst_for_element(
    element: &DocumentElement,
    template: &TemplateSpec,
    assets: &[AssetEntry],
    references: &[ReferenceEntry],
) -> Option<String> {
    let bibliography_keys = bibliography_citation_keys(references);
    let id = element_id(element);
    let label = label_for_id(&id);
    let builder =
        generate_element_typst(element, &label, template, assets, &bibliography_keys, false);
    let source = builder.source.trim();
    if source.is_empty() {
        None
    } else {
        Some(builder.source)
    }
}

fn generate_element_typst(
    element: &DocumentElement,
    label: &str,
    template: &TemplateSpec,
    assets: &[AssetEntry],
    bibliography_keys: &HashMap<String, String>,
    adjust_asset_paths: bool,
) -> SourceBuilder {
    let mut builder = SourceBuilder::default();
    match element {
        DocumentElement::Heading(heading) => {
            let level = heading.level.clamp(1, 6) as usize;
            let element_id = &heading.id;
            let field_id = rich_text_field_id(element_id);
            builder.push_literal(&format!("#heading(level: {}, [", level));

            let mut title = SourceBuilder::default();
            push_rich_text_field(
                &mut title,
                element_id,
                &field_id,
                &heading.content,
                bibliography_keys,
            );
            if title.source.trim().is_empty() {
                builder.push_generated_field_marker(element_id, &field_id, "Untitled heading", 0);
            } else {
                builder.push_builder(title);
            }
            builder.push_literal(&format!("]) <{label}>\n\n"));
        }
        DocumentElement::Paragraph(paragraph) => {
            let element_id = &paragraph.id;
            let field_id = rich_text_field_id(element_id);
            let mut par_builder = SourceBuilder::default();
            push_rich_text_field(
                &mut par_builder,
                element_id,
                &field_id,
                &paragraph.content,
                bibliography_keys,
            );
            if par_builder.source.trim().is_empty() {
                builder.clear();
            } else {
                builder.push_literal("#par([");
                builder.push_builder(par_builder);
                builder.push_literal(&format!("]) <{label}>\n\n"));
            }
        }
        DocumentElement::Equation(equation) => {
            let source = normalize_math_source(&equation.latex_source);
            if !source.is_empty() {
                let field_id = equation_source_field_id(&equation.id);
                builder.push_literal(&format!("#math.equation(block: {}, $", equation.is_block));
                builder.push_raw_field(&equation.id, &field_id, &source, 0);
                builder.push_literal(&format!("$) <{label}>\n\n"));
            }
        }
        DocumentElement::Table(table) => {
            let columns = table
                .column_sizes
                .iter()
                .map(|size| sanitize_table_column_size(size))
                .collect::<Vec<_>>()
                .join(", ");
            let columns = if columns.is_empty() {
                "1fr".to_string()
            } else {
                columns
            };

            let table_override = template
                .element_overrides
                .as_ref()
                .and_then(|o| o.table.as_ref());
            let wrapper = element_figure_wrapper_name(table_override);
            push_wrapper_symbol_import(template, wrapper, &mut builder);

            // Same `apa-figure` wrapper as figures: `table(...)` is a direct argument.
            builder.push_literal(&format!("#{wrapper}(\n  table(\n    columns: ({columns})"));

            for (row_index, row) in table.cells.iter().enumerate() {
                for (col_index, cell) in row.iter().enumerate() {
                    builder.push_literal(",\n  [");
                    builder.push_escaped_field(
                        &table.id,
                        &table_cell_field_id(&table.id, row_index, col_index),
                        &cell.content,
                        0,
                    );
                    builder.push_literal("]");
                }
            }

            builder.push_literal("\n  )");

            if let Some(placement) = typst_placement_arg(table_placement_value(table)) {
                builder.push_literal(&format!(",\n  placement: {placement}"));
            }

            push_override_extra_fields(
                &mut builder,
                &table.id,
                table_override,
                &table.extra_fields,
                &["placement"],
            );

            builder.push_literal(&format!("\n) <{label}>\n\n"));
        }
        DocumentElement::Figure(figure) => {
            let mut body = SourceBuilder::default();
            if let DocumentElement::Paragraph(paragraph) = &figure.content {
                push_rich_text_field(
                    &mut body,
                    &figure.id,
                    &figure_body_field_id(&figure.id),
                    &paragraph.content,
                    bibliography_keys,
                );
            }
            let caption = figure.caption.trim();
            let placement = typst_placement_arg(&figure.placement);
            let asset_path = figure
                .asset_id
                .as_ref()
                .filter(|asset_id| !asset_id.trim().is_empty())
                .and_then(|asset_id| {
                    assets
                        .iter()
                        .find(|asset| asset.id == *asset_id)
                        .map(|asset| asset.path.clone())
                        .or_else(|| Some(format!("assets/{}", path_id_for_id(asset_id))))
                })
                .map(|p| {
                    if adjust_asset_paths {
                        asset_path_relative_to_element(&p)
                    } else {
                        p
                    }
                });

            if body.source.trim().is_empty() && caption.is_empty() && asset_path.is_none() {
                return builder;
            }

            let figure_override = template
                .element_overrides
                .as_ref()
                .and_then(|o| o.figure.as_ref());
            let wrapper = element_figure_wrapper_name(figure_override);

            if uses_standard_typst_figure(wrapper) {
                builder.push_literal(&format!("#{wrapper}(\n  ["));

                if let Some(path) = asset_path {
                    let image_source = figure_image_typst_source(&path, &figure.extra_fields);
                    builder.push_generated_field_marker(
                        &figure.id,
                        &figure_body_field_id(&figure.id),
                        &image_source,
                        0,
                    );
                } else if body.source.trim().is_empty() {
                    builder.push_generated_field_marker(
                        &figure.id,
                        &figure_body_field_id(&figure.id),
                        "Figure content",
                        0,
                    );
                } else {
                    builder.push_builder(body);
                }

                builder.push_literal("]");

                if !caption.is_empty() {
                    builder.push_literal(",\n  caption: [");
                    builder.push_escaped_field(
                        &figure.id,
                        &figure_caption_field_id(&figure.id),
                        caption,
                        0,
                    );
                    builder.push_literal("]");
                }

                if let Some(placement) = placement {
                    builder.push_literal(&format!(",\n  placement: {placement}"));
                }
                push_override_extra_fields(
                    &mut builder,
                    &figure.id,
                    figure_override,
                    &figure.extra_fields,
                    &["caption", "width"],
                );
                builder.push_literal(&format!("\n) <{label}>\n\n"));
            } else {
                push_custom_wrapper_figure_element(
                    &mut builder,
                    template,
                    wrapper,
                    &figure.id,
                    figure_override,
                    body,
                    asset_path.as_deref(),
                    caption,
                    &figure.extra_fields,
                    &["caption", "width"],
                );
                builder.push_literal(&format!("<{label}>\n\n"));
            }
        }
        DocumentElement::Custom(custom) => {
            if let Some(spec) = template
                .custom_elements
                .iter()
                .find(|ce| ce.kind == custom.element_type)
            {
                builder.push_literal(&format!("#{}", spec.function));
                builder.push_literal("(\n");
                let mut first = true;
                for field_spec in &spec.fields {
                    let field_val =
                        custom
                            .fields
                            .get(&field_spec.key)
                            .cloned()
                            .unwrap_or_else(|| {
                                field_spec
                                    .default
                                    .clone()
                                    .unwrap_or(serde_json::Value::Null)
                            });

                    if field_spec.key == "_positional" {
                        if !first {
                            builder.push_literal(",\n");
                        }
                        first = false;
                        builder.push_literal("  ");
                        format_json_val_for_custom_field(
                            &custom.id,
                            &field_spec.key,
                            &field_val,
                            &field_spec.param_type,
                            &mut builder,
                        );
                    } else {
                        if !first {
                            builder.push_literal(",\n");
                        }
                        first = false;
                        builder.push_literal(&format!("  {}: ", field_spec.key));
                        format_json_val_for_custom_field(
                            &custom.id,
                            &field_spec.key,
                            &field_val,
                            &field_spec.param_type,
                            &mut builder,
                        );
                    }
                }
                builder.push_literal(&format!("\n) <{label}>\n\n"));
            } else {
                builder.push_literal(&format!(
                    "/* unknown custom element: {} */\n\n",
                    custom.element_type
                ));
            }
        }
    };
    builder
}
