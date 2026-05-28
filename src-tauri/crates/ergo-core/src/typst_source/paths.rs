use crate::ast::DocumentElement;

pub(crate) fn element_path(element_id: &str) -> String {
    format!("elements/{}.typ", path_id_for_id(element_id))
}

/// Asset paths (e.g. `assets/photo.webp`) are root-relative in the VFS, but
/// Typst resolves `image("…")` relative to the file that contains the call.
/// Element files live under `elements/`, so prepend `../` to reach the root.
pub(crate) fn asset_path_relative_to_element(root_relative_path: &str) -> String {
    format!("../{root_relative_path}")
}

pub(crate) fn element_id(element: &DocumentElement) -> String {
    match element {
        DocumentElement::Heading(heading) => heading.id.clone(),
        DocumentElement::Paragraph(paragraph) => paragraph.id.clone(),
        DocumentElement::Quote(quote) => quote.id.clone(),
        DocumentElement::List(list) => list.id.clone(),
        DocumentElement::Enumeration(enumeration) => enumeration.id.clone(),
        DocumentElement::Table(table) => table.id.clone(),
        DocumentElement::Equation(equation) => equation.id.clone(),
        DocumentElement::Figure(figure) => figure.id.clone(),
        DocumentElement::Diagram(diagram) => diagram.id.clone(),
        DocumentElement::Custom(custom) => custom.id.clone(),
    }
}

pub(crate) fn element_kind(element: &DocumentElement) -> &'static str {
    match element {
        DocumentElement::Heading(_) => "Heading",
        DocumentElement::Paragraph(_) => "Paragraph",
        DocumentElement::Quote(_) => "Quote",
        DocumentElement::List(_) => "List",
        DocumentElement::Enumeration(_) => "Enumeration",
        DocumentElement::Table(_) => "Table",
        DocumentElement::Equation(_) => "Equation",
        DocumentElement::Figure(_) => "Figure",
        DocumentElement::Diagram(_) => "Diagram",
        DocumentElement::Custom(_) => "Custom",
    }
}

pub(crate) fn label_for_id(id: &str) -> String {
    let normalized = path_id_for_id(id);
    if normalized.is_empty() {
        "ergo-element".to_string()
    } else {
        format!("ergo-{normalized}")
    }
}

pub(crate) fn rich_text_field_id(element_id: &str) -> String {
    format!("{element_id}:text")
}

pub(crate) fn equation_source_field_id(element_id: &str) -> String {
    format!("{element_id}:latexSource")
}

pub(crate) fn table_cell_field_id(element_id: &str, row_index: usize, col_index: usize) -> String {
    format!("{element_id}:cell:{row_index}:{col_index}")
}

pub(crate) fn figure_caption_field_id(element_id: &str) -> String {
    format!("{element_id}:caption")
}

pub(crate) fn path_id_for_id(id: &str) -> String {
    let mut normalized = String::new();
    let mut previous_was_dash = false;

    for character in id.to_lowercase().chars() {
        let next = if character.is_ascii_alphanumeric() || character == '_' {
            Some(character)
        } else {
            Some('-')
        };

        if let Some(character) = next {
            if character == '-' {
                if !previous_was_dash {
                    normalized.push(character);
                }
                previous_was_dash = true;
            } else {
                normalized.push(character);
                previous_was_dash = false;
            }
        }
    }

    normalized.trim_matches('-').to_string()
}
