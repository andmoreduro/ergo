use crate::ast::{
    AssetEntry, DocumentAST, DocumentElement, DocumentSection, EquationSyntax, Figure, Paragraph,
    ReferenceEntry, RichText, Table, TableCell,
};
use crate::document_session_types::DocumentEvent;

pub(crate) fn apply_document_event(
    ast: &mut DocumentAST,
    event: DocumentEvent,
) -> Result<(), String> {
    match event {
        DocumentEvent::SetProjectTitle { title } => {
            ast.metadata.title = title;
            Ok(())
        }
        DocumentEvent::SetProjectSettings { settings } => {
            ast.metadata.project_settings = settings;
            Ok(())
        }
        DocumentEvent::SetTemplateVariant { variant_id } => {
            ast.metadata.template_variant_id = Some(variant_id);
            Ok(())
        }
        DocumentEvent::UpdateInput { path, value } => {
            if path == "/title" {
                if let Some(title) = value.as_str() {
                    ast.metadata.title = title.to_string();
                }
            }
            set_value_at_path(&mut ast.inputs, &path, value)
        }
        DocumentEvent::InsertInputArrayItem { path, index, value } => {
            insert_input_array_item(&mut ast.inputs, &path, index, value)
        }
        DocumentEvent::RemoveInputArrayItem { path, index } => {
            remove_input_array_item(&mut ast.inputs, &path, index)
        }
        DocumentEvent::InsertElement {
            section_id,
            index,
            element,
        }
        | DocumentEvent::RestoreElement {
            section_id,
            index,
            element,
        } => insert_element_at(ast, &section_id, index, *element, "restore element"),
        DocumentEvent::RemoveElement { element_id } => remove_element(ast, &element_id),
        DocumentEvent::UpdateParagraphText { element_id, text } => {
            let element = element_mut(ast, &element_id)?;
            match element {
                DocumentElement::Paragraph(paragraph) => {
                    paragraph.content = rich_text_from_string(text);
                    Ok(())
                }
                _ => Err(format!("Element {element_id} is not a paragraph")),
            }
        }
        DocumentEvent::UpdateParagraphContent {
            element_id,
            content,
        } => {
            let element = element_mut(ast, &element_id)?;
            match element {
                DocumentElement::Paragraph(paragraph) => {
                    paragraph.content = content;
                    Ok(())
                }
                _ => Err(format!("Element {element_id} is not a paragraph")),
            }
        }
        DocumentEvent::UpdateHeading {
            element_id,
            text,
            level,
        } => {
            let element = element_mut(ast, &element_id)?;
            match element {
                DocumentElement::Heading(heading) => {
                    if let Some(text) = text {
                        heading.content = rich_text_from_string(text);
                    }
                    if let Some(level) = level {
                        heading.level = level;
                    }
                    Ok(())
                }
                _ => Err(format!("Element {element_id} is not a heading")),
            }
        }
        DocumentEvent::UpdateHeadingContent {
            element_id,
            content,
            level,
        } => {
            let element = element_mut(ast, &element_id)?;
            match element {
                DocumentElement::Heading(heading) => {
                    heading.content = content;
                    if let Some(level) = level {
                        heading.level = level;
                    }
                    Ok(())
                }
                _ => Err(format!("Element {element_id} is not a heading")),
            }
        }
        DocumentEvent::UpdateEquation {
            element_id,
            latex_source,
            is_block,
            syntax,
        } => {
            let element = element_mut(ast, &element_id)?;
            match element {
                DocumentElement::Equation(equation) => {
                    if let Some(latex_source) = latex_source {
                        equation.latex_source = latex_source;
                    }
                    if let Some(is_block) = is_block {
                        equation.is_block = is_block;
                    }
                    if let Some(syntax) = syntax {
                        equation.syntax = syntax;
                    }
                    Ok(())
                }
                _ => Err(format!("Element {element_id} is not an equation")),
            }
        }
        DocumentEvent::UpdateTableCell {
            table_id,
            row_index,
            col_index,
            text,
        } => {
            let cell = table_mut(ast, &table_id)?
                .cells
                .get_mut(row_index)
                .and_then(|row| row.get_mut(col_index))
                .ok_or_else(|| {
                    format!("Table cell {row_index},{col_index} was not found in {table_id}")
                })?;
            cell.content = text;
            Ok(())
        }
        DocumentEvent::InsertTableRow {
            table_id,
            row_index,
            cells,
        }
        | DocumentEvent::RestoreTableRow {
            table_id,
            row_index,
            cells,
        } => insert_table_row(ast, &table_id, row_index, cells),
        DocumentEvent::RemoveTableRow {
            table_id,
            row_index,
        } => remove_table_row(ast, &table_id, row_index),
        DocumentEvent::InsertTableColumn {
            table_id,
            col_index,
            cells,
            size,
        }
        | DocumentEvent::RestoreTableColumn {
            table_id,
            col_index,
            cells,
            size,
        } => insert_table_column(ast, &table_id, col_index, cells, size),
        DocumentEvent::RemoveTableColumn {
            table_id,
            col_index,
        } => remove_table_column(ast, &table_id, col_index),
        DocumentEvent::UpdateTableColumnSize {
            table_id,
            col_index,
            size,
        } => {
            let table = table_mut(ast, &table_id)?;
            let column_size = table
                .column_sizes
                .get_mut(col_index)
                .ok_or_else(|| format!("Table column {col_index} was not found in {table_id}"))?;
            *column_size = size;
            Ok(())
        }
        DocumentEvent::UpdateFigure {
            element_id,
            caption,
            placement,
            body_text,
            asset_id,
        } => {
            let element = element_mut(ast, &element_id)?;
            match element {
                DocumentElement::Figure(figure) => {
                    if let Some(caption) = caption {
                        figure.caption = caption;
                    }
                    if let Some(placement) = placement {
                        figure.placement = placement;
                    }
                    if let Some(body_text) = body_text {
                        update_figure_body(figure, body_text);
                    }
                    if let Some(asset_id) = asset_id {
                        figure.asset_id = Some(asset_id);
                    }
                    Ok(())
                }
                _ => Err(format!("Element {element_id} is not a figure")),
            }
        }
        DocumentEvent::UpdateCustomElementField {
            element_id,
            field,
            value,
        } => {
            let el = element_mut(ast, &element_id)?;
            match el {
                DocumentElement::Custom(custom) => {
                    if value.is_null() {
                        custom.fields.remove(&field);
                    } else {
                        custom.fields.insert(field, value);
                    }
                    Ok(())
                }
                _ => Err(format!("Element {} is not a custom element", element_id)),
            }
        }
        DocumentEvent::UpdateElementExtraField {
            element_id,
            field_key,
            field_value,
        } => {
            let el = element_mut(ast, &element_id)?;
            match el {
                DocumentElement::Table(table) => {
                    if field_value.is_null() {
                        table.extra_fields.remove(&field_key);
                    } else {
                        table.extra_fields.insert(field_key, field_value);
                    }
                    Ok(())
                }
                DocumentElement::Figure(figure) => {
                    if field_value.is_null() {
                        figure.extra_fields.remove(&field_key);
                    } else {
                        figure.extra_fields.insert(field_key, field_value);
                    }
                    Ok(())
                }
                DocumentElement::Diagram(diagram) => {
                    if field_value.is_null() {
                        diagram.extra_fields.remove(&field_key);
                    } else {
                        diagram.extra_fields.insert(field_key, field_value);
                    }
                    Ok(())
                }
                _ => Err(format!(
                    "Element {element_id} is not a table, figure, or diagram"
                )),
            }
        }
        DocumentEvent::InsertReference { index, reference }
        | DocumentEvent::RestoreReference { index, reference } => {
            insert_reference(ast, index, reference)
        }
        DocumentEvent::UpdateReference { reference } => update_reference(ast, reference),
        DocumentEvent::RemoveReference { reference_id } => remove_reference(ast, &reference_id),
        DocumentEvent::InsertAsset { index, asset }
        | DocumentEvent::RestoreAsset { index, asset } => insert_asset(ast, index, asset),
        DocumentEvent::UpdateAsset { asset } => update_asset(ast, asset),
        DocumentEvent::RemoveAsset { asset_id } => remove_asset(ast, &asset_id),
    }
}

// ─── Input Path Modification Helpers ─────────────────────────────────

fn set_value_at_path(
    inputs: &mut std::collections::HashMap<String, serde_json::Value>,
    path: &str,
    value: serde_json::Value,
) -> Result<(), String> {
    if !path.starts_with('/') {
        return Err(format!("Invalid path format: {}", path));
    }

    let mut map = serde_json::Map::new();
    for (k, v) in inputs.drain() {
        map.insert(k, v);
    }
    let mut root = serde_json::Value::Object(map);

    if let Some(target) = root.pointer_mut(path) {
        *target = value;
    } else {
        let parts: Vec<&str> = path.split('/').skip(1).collect();
        if parts.is_empty() {
            return Err("Path cannot be empty".to_string());
        }

        let mut curr = &mut root;
        for (i, part) in parts.iter().enumerate() {
            let part_str = part.replace("~1", "/").replace("~0", "~");
            let is_last = i == parts.len() - 1;
            if is_last {
                match curr {
                    serde_json::Value::Array(arr) => {
                        if let Ok(idx) = part_str.parse::<usize>() {
                            if idx < arr.len() {
                                arr[idx] = value.clone();
                            } else if idx == arr.len() {
                                arr.push(value.clone());
                            } else {
                                return Err(format!(
                                    "Index {} out of bounds for array at path",
                                    idx
                                ));
                            }
                        } else {
                            return Err(format!("Invalid array index '{}'", part_str));
                        }
                    }
                    serde_json::Value::Object(obj) => {
                        obj.insert(part_str, value.clone());
                    }
                    _ => {
                        return Err(format!(
                            "Cannot set value on non-container at path {}",
                            path
                        ));
                    }
                }
            } else {
                let next_part = parts[i + 1].replace("~1", "/").replace("~0", "~");
                let is_next_array = next_part.parse::<usize>().is_ok();

                if curr.is_null() {
                    *curr = if is_next_array {
                        serde_json::Value::Array(Vec::new())
                    } else {
                        serde_json::Value::Object(serde_json::Map::new())
                    };
                }

                match curr {
                    serde_json::Value::Array(arr) => {
                        if let Ok(idx) = part_str.parse::<usize>() {
                            while arr.len() <= idx {
                                arr.push(serde_json::Value::Null);
                            }
                            curr = &mut arr[idx];
                        } else {
                            return Err(format!("Invalid array index '{}'", part_str));
                        }
                    }
                    serde_json::Value::Object(obj) => {
                        curr = obj.entry(part_str).or_insert_with(|| {
                            if is_next_array {
                                serde_json::Value::Array(Vec::new())
                            } else {
                                serde_json::Value::Object(serde_json::Map::new())
                            }
                        });
                    }
                    _ => {
                        return Err(format!("Cannot traverse non-container at path {}", path));
                    }
                }
            }
        }
    }

    if let serde_json::Value::Object(map) = root {
        for (k, v) in map {
            inputs.insert(k, v);
        }
    }
    Ok(())
}

fn insert_input_array_item(
    inputs: &mut std::collections::HashMap<String, serde_json::Value>,
    path: &str,
    index: usize,
    value: serde_json::Value,
) -> Result<(), String> {
    if !path.starts_with('/') {
        return Err(format!("Invalid path format: {}", path));
    }
    let mut map = serde_json::Map::new();
    for (k, v) in inputs.drain() {
        map.insert(k, v);
    }
    let mut root = serde_json::Value::Object(map);

    if let Some(target) = root.pointer_mut(path) {
        if let Some(arr) = target.as_array_mut() {
            if index <= arr.len() {
                arr.insert(index, value);
            } else {
                arr.push(value);
            }
        } else {
            return Err(format!("Target at path {} is not an array", path));
        }
    } else {
        return Err(format!("Path {} was not found", path));
    }

    if let serde_json::Value::Object(map) = root {
        for (k, v) in map {
            inputs.insert(k, v);
        }
    }
    Ok(())
}

fn remove_input_array_item(
    inputs: &mut std::collections::HashMap<String, serde_json::Value>,
    path: &str,
    index: usize,
) -> Result<(), String> {
    if !path.starts_with('/') {
        return Err(format!("Invalid path format: {}", path));
    }
    let mut map = serde_json::Map::new();
    for (k, v) in inputs.drain() {
        map.insert(k, v);
    }
    let mut root = serde_json::Value::Object(map);

    if let Some(target) = root.pointer_mut(path) {
        if let Some(arr) = target.as_array_mut() {
            if index < arr.len() {
                arr.remove(index);
            } else {
                return Err(format!(
                    "Index {} out of bounds for array at {}",
                    index, path
                ));
            }
        } else {
            return Err(format!("Target at path {} is not an array", path));
        }
    } else {
        return Err(format!("Path {} was not found", path));
    }

    if let serde_json::Value::Object(map) = root {
        for (k, v) in map {
            inputs.insert(k, v);
        }
    }
    Ok(())
}

// ─── AST Navigation Helpers ──────────────────────────────────────────

fn content_section_mut<'a>(
    ast: &'a mut DocumentAST,
    section_id: &str,
) -> Result<&'a mut crate::ast::ContentSection, String> {
    ast.sections
        .iter_mut()
        .find_map(|section| match section {
            DocumentSection::Content(content) if content.id == section_id => Some(content),
            _ => None,
        })
        .ok_or_else(|| format!("Content section {section_id} was not found"))
}

fn element_mut<'a>(
    ast: &'a mut DocumentAST,
    element_id: &str,
) -> Result<&'a mut DocumentElement, String> {
    ast.sections
        .iter_mut()
        .find_map(|section| match section {
            DocumentSection::Content(content) => content
                .elements
                .iter_mut()
                .find(|element| element_id_of(element) == element_id),
        })
        .ok_or_else(|| format!("Element {element_id} was not found"))
}

fn table_mut<'a>(ast: &'a mut DocumentAST, table_id: &str) -> Result<&'a mut Table, String> {
    match element_mut(ast, table_id)? {
        DocumentElement::Table(table) => Ok(table),
        _ => Err(format!("Element {table_id} is not a table")),
    }
}

fn insert_element_at(
    ast: &mut DocumentAST,
    section_id: &str,
    index: usize,
    element: DocumentElement,
    operation: &str,
) -> Result<(), String> {
    let section = content_section_mut(ast, section_id)?;
    if index > section.elements.len() {
        return Err(format!(
            "Cannot {operation} at index {index} in section {section_id}"
        ));
    }
    section.elements.insert(index, element);
    Ok(())
}

fn remove_element(ast: &mut DocumentAST, element_id: &str) -> Result<(), String> {
    for section in &mut ast.sections {
        match section {
            DocumentSection::Content(content) => {
                if let Some(index) = content
                    .elements
                    .iter()
                    .position(|element| element_id_of(element) == element_id)
                {
                    content.elements.remove(index);
                    return Ok(());
                }
            }
        }
    }
    Err(format!("Element {element_id} was not found"))
}

fn insert_table_row(
    ast: &mut DocumentAST,
    table_id: &str,
    row_index: usize,
    cells: Vec<TableCell>,
) -> Result<(), String> {
    let table = table_mut(ast, table_id)?;
    let expected_cols = usize::try_from(table.cols).unwrap_or(0);
    if cells.len() != expected_cols {
        return Err(format!(
            "Cannot restore table row with {} cells into {table_id}; expected {expected_cols}",
            cells.len()
        ));
    }
    if row_index > table.cells.len() {
        return Err(format!("Cannot restore table row at index {row_index}"));
    }
    table.cells.insert(row_index, cells);
    table.rows = i32::try_from(table.cells.len()).map_err(|error| error.to_string())?;
    Ok(())
}

fn remove_table_row(ast: &mut DocumentAST, table_id: &str, row_index: usize) -> Result<(), String> {
    let table = table_mut(ast, table_id)?;
    if table.cells.len() <= 1 {
        return Err(format!("Cannot remove the last row from {table_id}"));
    }
    if row_index >= table.cells.len() {
        return Err(format!("Table row {row_index} was not found in {table_id}"));
    }
    table.cells.remove(row_index);
    table.rows = i32::try_from(table.cells.len()).map_err(|error| error.to_string())?;
    Ok(())
}

fn insert_table_column(
    ast: &mut DocumentAST,
    table_id: &str,
    col_index: usize,
    cells: Vec<TableCell>,
    size: String,
) -> Result<(), String> {
    let table = table_mut(ast, table_id)?;
    let expected_rows = usize::try_from(table.rows).unwrap_or(0);
    if cells.len() != expected_rows {
        return Err(format!(
            "Cannot restore table column with {} cells into {table_id}; expected {expected_rows}",
            cells.len()
        ));
    }
    if col_index > table.column_sizes.len() {
        return Err(format!("Cannot restore table column at index {col_index}"));
    }
    for (row, cell) in table.cells.iter_mut().zip(cells) {
        if col_index > row.len() {
            return Err(format!("Cannot restore table column at index {col_index}"));
        }
        row.insert(col_index, cell);
    }
    table.column_sizes.insert(col_index, size);
    table.cols = i32::try_from(table.column_sizes.len()).map_err(|error| error.to_string())?;
    Ok(())
}

fn remove_table_column(
    ast: &mut DocumentAST,
    table_id: &str,
    col_index: usize,
) -> Result<(), String> {
    let table = table_mut(ast, table_id)?;
    if table.column_sizes.len() <= 1 {
        return Err(format!("Cannot remove the last column from {table_id}"));
    }
    if col_index >= table.column_sizes.len() {
        return Err(format!(
            "Table column {col_index} was not found in {table_id}"
        ));
    }
    for row in &mut table.cells {
        if col_index >= row.len() {
            return Err(format!(
                "Table column {col_index} was not found in {table_id}"
            ));
        }
        row.remove(col_index);
    }
    table.column_sizes.remove(col_index);
    table.cols = i32::try_from(table.column_sizes.len()).map_err(|error| error.to_string())?;
    Ok(())
}

fn update_figure_body(figure: &mut Figure, text: String) {
    match &mut figure.content {
        DocumentElement::Paragraph(paragraph) => {
            paragraph.content = rich_text_from_string(text);
        }
        _ => {
            figure.content = DocumentElement::Paragraph(Paragraph {
                id: format!("{}-body", figure.id),
                content: rich_text_from_string(text),
            });
        }
    }
}

fn insert_reference(
    ast: &mut DocumentAST,
    index: usize,
    reference: ReferenceEntry,
) -> Result<(), String> {
    if index > ast.references.len() {
        return Err(format!("Cannot insert reference at index {index}"));
    }

    ast.references.insert(index, reference);
    Ok(())
}

fn update_reference(ast: &mut DocumentAST, reference: ReferenceEntry) -> Result<(), String> {
    let existing = ast
        .references
        .iter_mut()
        .find(|entry| entry.id == reference.id)
        .ok_or_else(|| format!("Reference {} was not found", reference.id))?;

    *existing = reference;
    Ok(())
}

fn remove_reference(ast: &mut DocumentAST, reference_id: &str) -> Result<(), String> {
    let index = ast
        .references
        .iter()
        .position(|entry| entry.id == reference_id)
        .ok_or_else(|| format!("Reference {reference_id} was not found"))?;

    ast.references.remove(index);
    Ok(())
}

fn insert_asset(ast: &mut DocumentAST, index: usize, asset: AssetEntry) -> Result<(), String> {
    if index > ast.assets.len() {
        return Err(format!("Cannot insert asset at index {index}"));
    }

    ast.assets.insert(index, asset);
    Ok(())
}

fn update_asset(ast: &mut DocumentAST, asset: AssetEntry) -> Result<(), String> {
    let existing = ast
        .assets
        .iter_mut()
        .find(|entry| entry.id == asset.id)
        .ok_or_else(|| format!("Asset {} was not found", asset.id))?;

    *existing = asset;
    Ok(())
}

fn remove_asset(ast: &mut DocumentAST, asset_id: &str) -> Result<(), String> {
    let index = ast
        .assets
        .iter()
        .position(|entry| entry.id == asset_id)
        .ok_or_else(|| format!("Asset {asset_id} was not found"))?;

    ast.assets.remove(index);
    Ok(())
}

fn rich_text_from_string(text: String) -> Vec<RichText> {
    if text.is_empty() {
        return Vec::new();
    }

    vec![RichText {
        text,
        bold: None,
        italic: None,
        underline: None,
        kind: None,
        reference_id: None,
        equation_source: None,
        equation_syntax: EquationSyntax::Typst,
    }]
}

fn element_id_of(element: &DocumentElement) -> &str {
    match element {
        DocumentElement::Heading(heading) => &heading.id,
        DocumentElement::Paragraph(paragraph) => &paragraph.id,
        DocumentElement::Quote(quote) => &quote.id,
        DocumentElement::List(list) => &list.id,
        DocumentElement::Enumeration(enumeration) => &enumeration.id,
        DocumentElement::Table(table) => &table.id,
        DocumentElement::Equation(equation) => &equation.id,
        DocumentElement::Figure(figure) => &figure.id,
        DocumentElement::Diagram(diagram) => &diagram.id,
        DocumentElement::Custom(custom) => &custom.id,
    }
}
