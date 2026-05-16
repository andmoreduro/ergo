use crate::ast::{
    DocumentAST, DocumentElement, DocumentSection, Figure, Paragraph, RichText, Table, TableCell,
};
use crate::document_session_types::{AuthorField, DocumentEvent};
pub(crate) fn apply_document_event(ast: &mut DocumentAST, event: DocumentEvent) -> Result<(), String> {
    match event {
        DocumentEvent::SetProjectTitle { title } => {
            ast.metadata.title = title;
            Ok(())
        }
        DocumentEvent::SetProjectSettings { settings } => {
            ast.metadata.project_settings = settings;
            Ok(())
        }
        DocumentEvent::UpdateCoverAbstract { section_id, text } => {
            cover_section_mut(ast, &section_id)?.abstract_text = text;
            Ok(())
        }
        DocumentEvent::UpdateCoverAffiliations {
            section_id,
            affiliations,
        } => {
            cover_section_mut(ast, &section_id)?.affiliations = affiliations;
            Ok(())
        }
        DocumentEvent::InsertAuthor {
            section_id,
            index,
            author,
        }
        | DocumentEvent::RestoreAuthor {
            section_id,
            author_index: index,
            author,
        } => {
            let cover_page = cover_section_mut(ast, &section_id)?;
            if index > cover_page.authors.len() {
                return Err(format!("Cannot restore author at index {index}"));
            }
            cover_page.authors.insert(index, author);
            Ok(())
        }
        DocumentEvent::UpdateAuthor {
            section_id,
            author_index,
            field,
            value,
        } => {
            let author = cover_section_mut(ast, &section_id)?
                .authors
                .get_mut(author_index)
                .ok_or_else(|| format!("Author index {author_index} was not found"))?;
            match field {
                AuthorField::Name => author.name = value,
                AuthorField::Email => {
                    author.email = if value.trim().is_empty() {
                        None
                    } else {
                        Some(value)
                    }
                }
            }
            Ok(())
        }
        DocumentEvent::RemoveAuthor {
            section_id,
            author_index,
        } => {
            let cover_page = cover_section_mut(ast, &section_id)?;
            if author_index >= cover_page.authors.len() {
                return Err(format!("Author index {author_index} was not found"));
            }
            cover_page.authors.remove(author_index);
            Ok(())
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
        DocumentEvent::UpdateEquation {
            element_id,
            latex_source,
            is_block,
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
                    Ok(())
                }
                _ => Err(format!("Element {element_id} is not a figure")),
            }
        }
    }
}

fn cover_section_mut<'a>(
    ast: &'a mut DocumentAST,
    section_id: &str,
) -> Result<&'a mut crate::ast::CoverPageSection, String> {
    ast.sections
        .iter_mut()
        .find_map(|section| match section {
            DocumentSection::CoverPage(cover_page) if cover_page.id == section_id => {
                Some(cover_page)
            }
            _ => None,
        })
        .ok_or_else(|| format!("Cover page section {section_id} was not found"))
}

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
            _ => None,
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
        if let DocumentSection::Content(content) = section {
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

fn rich_text_from_string(text: String) -> Vec<RichText> {
    if text.is_empty() {
        return Vec::new();
    }

    vec![RichText {
        text,
        bold: None,
        italic: None,
        kind: None,
        reference_id: None,
        equation_source: None,
    }]
}

fn element_id_of(element: &DocumentElement) -> &str {
    match element {
        DocumentElement::Heading(heading) => &heading.id,
        DocumentElement::Paragraph(paragraph) => &paragraph.id,
        DocumentElement::Table(table) => &table.id,
        DocumentElement::Equation(equation) => &equation.id,
        DocumentElement::Figure(figure) => &figure.id,
    }
}
