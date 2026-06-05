use crate::ast::{DocumentAST, DocumentElement, DocumentSection};

pub fn is_generated_diagram_asset_path(path: &str) -> bool {
    path.starts_with("assets/diagrams/")
        && path.ends_with(".svg")
        && !path.contains("..")
        && path
            .strip_prefix("assets/diagrams/")
            .map(|file_name| !file_name.is_empty() && !file_name.contains('/'))
            .unwrap_or(false)
}

pub fn generated_diagram_asset_path_for_element(
    ast: &DocumentAST,
    element_id: &str,
) -> Option<String> {
    let diagram = find_diagram(ast, element_id)?;
    let asset_id = diagram.asset_id.as_deref()?;
    let asset = ast.assets.iter().find(|entry| entry.id == asset_id)?;
    if is_generated_diagram_asset_path(&asset.path) {
        Some(asset.path.clone())
    } else {
        None
    }
}

pub fn generated_diagram_asset_path_for_asset_id(
    ast: &DocumentAST,
    asset_id: &str,
) -> Option<String> {
    let asset = ast.assets.iter().find(|entry| entry.id == asset_id)?;
    if is_generated_diagram_asset_path(&asset.path) {
        Some(asset.path.clone())
    } else {
        None
    }
}

fn find_diagram<'a>(
    ast: &'a DocumentAST,
    element_id: &str,
) -> Option<&'a crate::ast::Diagram> {
    for section in &ast.sections {
        let DocumentSection::Content(content) = section;
        for element in &content.elements {
            if let DocumentElement::Diagram(diagram) = element {
                if diagram.id == element_id {
                    return Some(diagram);
                }
            }
        }
    }
    None
}
