use crate::action_types::ContextDescriptor;

pub fn context_glossary() -> Vec<ContextDescriptor> {
    vec![
        context("app", &[]),
        context("welcome", &[]),
        context("workspace", &[]),
        context("editor", &[]),
        context("body", &[]),
        context("element", &["element.kind", "element.id"]),
        context("dialog", &["dialog.kind"]),
        context("quote", &["quote.inline"]),
        context("table", &[]),
        context("tableCell", &[]),
        context("bibliography", &[]),
        context("resources", &[]),
        context("coverPage", &[]),
        context("preview", &[]),
        context("input", &[]),
        context("inlineElement", &["element.kind"]),
        context("settings", &[]),
    ]
}

fn context(name: &str, attribute_keys: &[&str]) -> ContextDescriptor {
    ContextDescriptor {
        name: name.to_string(),
        description_key: format!("context_{name}"),
        attribute_keys: attribute_keys.iter().map(|key| (*key).to_string()).collect(),
    }
}
