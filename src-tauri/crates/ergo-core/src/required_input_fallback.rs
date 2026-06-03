use crate::ast::{DocumentAST, RichText};
use crate::template_spec::{Importance, InputSchema, InputType, TemplateSpec};

/// Substitutes required template input labels when values are empty so Typst
/// generation always has compile-safe content. The document AST is unchanged.
pub(crate) struct RequiredInputFallbacks<'a> {
    template: &'a TemplateSpec,
    variant_id: Option<&'a str>,
}

impl<'a> RequiredInputFallbacks<'a> {
    pub(crate) fn new(template: &'a TemplateSpec, variant_id: Option<&'a str>) -> Self {
        Self {
            template,
            variant_id,
        }
    }

    pub(crate) fn from_ast(template: &'a TemplateSpec, ast: &'a DocumentAST) -> Self {
        Self::new(template, ast.metadata.template_variant_id.as_deref())
    }

    pub(crate) fn effective_title<'s>(&self, raw: &'s str) -> String {
        self.effective_string("title", raw)
    }

    pub(crate) fn effective_string(&self, input_id: &str, raw: &str) -> String {
        if !raw.trim().is_empty() {
            return raw.to_string();
        }
        self.required_label_for(input_id)
            .unwrap_or_else(|| raw.to_string())
    }

    pub(crate) fn prepare_input_value(
        &self,
        input_id: &str,
        value: &serde_json::Value,
    ) -> serde_json::Value {
        let Some(schema) = self.schema_by_id(input_id) else {
            return value.clone();
        };
        if schema.importance != Importance::Required || !self.applies(schema) {
            return value.clone();
        }

        match schema.input_type {
            InputType::Array if input_id == "authors" => self.prepare_authors(value, schema),
            InputType::SimpleList => self.prepare_simple_list(value, schema),
            _ => value.clone(),
        }
    }

    fn prepare_simple_list(
        &self,
        value: &serde_json::Value,
        schema: &InputSchema,
    ) -> serde_json::Value {
        let item_is_content = schema
            .items
            .as_ref()
            .is_some_and(|items| items.input_type == InputType::Content);

        if item_is_content {
            let items = value
                .as_array()
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| Self::prepare_simple_list_content_item(item))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            if !items.is_empty() {
                return serde_json::Value::Array(items);
            }

            return serde_json::json!([Self::rich_text_label_value(schema)]);
        }

        let items = value
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str())
                    .map(str::trim)
                    .filter(|item| !item.is_empty())
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        if !items.is_empty() {
            return serde_json::Value::Array(
                items.into_iter().map(serde_json::Value::String).collect(),
            );
        }

        serde_json::json!([Self::field_label(schema)])
    }

    fn prepare_simple_list_content_item(item: &serde_json::Value) -> Option<serde_json::Value> {
        if let Some(text) = item.as_str() {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                return None;
            }
            return Some(Self::rich_text_label_value_text(trimmed));
        }

        let content = serde_json::from_value::<Vec<RichText>>(item.clone()).ok()?;
        if content.iter().all(|span| {
            span.kind.as_deref() != Some("reference") && span.text.trim().is_empty()
        }) {
            return None;
        }

        serde_json::to_value(content).ok()
    }

    fn rich_text_label_value(schema: &InputSchema) -> serde_json::Value {
        Self::rich_text_label_value_text(&Self::field_label(schema))
    }

    fn rich_text_label_value_text(text: &str) -> serde_json::Value {
        serde_json::json!([{
            "text": text,
            "bold": null,
            "italic": null,
            "underline": null,
            "kind": null,
            "reference_id": null,
            "equation_source": null,
            "equation_syntax": "typst",
        }])
    }

    fn prepare_authors(
        &self,
        value: &serde_json::Value,
        schema: &InputSchema,
    ) -> serde_json::Value {
        let placeholder = Self::field_label(schema);
        let Some(items) = value.as_array() else {
            return serde_json::json!([{
                "name": placeholder,
                "affiliations": []
            }]);
        };

        if items.is_empty() {
            return serde_json::json!([{
                "name": placeholder,
                "affiliations": []
            }]);
        }

        let mut prepared = Vec::with_capacity(items.len());
        for item in items {
            let Some(obj) = item.as_object() else {
                continue;
            };
            let mut next = obj.clone();
            let name = obj
                .get("name")
                .and_then(|value| value.as_str())
                .unwrap_or("");
            if name.trim().is_empty() {
                next.insert(
                    "name".to_string(),
                    serde_json::Value::String(placeholder.clone()),
                );
            }
            prepared.push(serde_json::Value::Object(next));
        }

        if prepared.is_empty() {
            return serde_json::json!([{
                "name": placeholder,
                "affiliations": []
            }]);
        }

        serde_json::Value::Array(prepared)
    }

    pub(crate) fn required_label_for(&self, input_id: &str) -> Option<String> {
        let schema = self.schema_by_id(input_id)?;
        if schema.importance != Importance::Required || !self.applies(schema) {
            return None;
        }
        Some(Self::field_label(schema))
    }

    fn schema_by_id(&self, input_id: &str) -> Option<&InputSchema> {
        self.template
            .editor
            .inputs
            .iter()
            .find(|schema| schema.id.as_deref() == Some(input_id))
    }

    fn applies(&self, schema: &InputSchema) -> bool {
        match &schema.variants {
            None => true,
            Some(variants) if variants.is_empty() => true,
            Some(variants) => self
                .variant_id
                .map(|variant| variants.iter().any(|id| id == variant))
                .unwrap_or(true),
        }
    }

    fn field_label(schema: &InputSchema) -> String {
        schema
            .label
            .as_deref()
            .map(str::trim)
            .filter(|label| !label.is_empty())
            .or_else(|| {
                schema
                    .id
                    .as_deref()
                    .map(str::trim)
                    .filter(|id| !id.is_empty())
            })
            .unwrap_or("Field")
            .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::template_spec::load_bundled_template;

    #[test]
    fn empty_required_authors_receive_field_label() {
        let template = load_bundled_template("apa7").expect("template");
        let fallbacks = RequiredInputFallbacks::new(&template, Some("student"));
        let prepared = fallbacks.prepare_input_value("authors", &serde_json::json!([]));

        assert_eq!(
            prepared,
            serde_json::json!([{ "name": "Authors", "affiliations": [] }])
        );
    }

    #[test]
    fn empty_author_name_uses_authors_field_label() {
        let template = load_bundled_template("apa7").expect("template");
        let fallbacks = RequiredInputFallbacks::new(&template, Some("student"));
        let prepared = fallbacks.prepare_input_value(
            "authors",
            &serde_json::json!([{ "name": "", "affiliations": [] }]),
        );

        assert_eq!(
            prepared,
            serde_json::json!([{ "name": "Authors", "affiliations": [] }])
        );
    }

    #[test]
    fn optional_inputs_are_not_modified() {
        let template = load_bundled_template("apa7").expect("template");
        let fallbacks = RequiredInputFallbacks::new(&template, Some("student"));
        let prepared = fallbacks.prepare_input_value("keywords", &serde_json::json!([]));

        assert_eq!(prepared, serde_json::json!([]));
    }
}
