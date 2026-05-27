use serde::{Deserialize, Serialize};
use ts_rs::TS;

const VERSATILE_APA_TEMPLATE: &str =
    include_str!("../../../resources/templates/versatile-apa/template.json");

// ─── Template Spec Root ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TemplateSpec {
    pub template: TemplateIdentity,
    pub package: PackageSpec,
    #[serde(default)]
    pub variants: Vec<TemplateVariantSpec>,
    pub show_rule: Option<ShowRuleSpec>,
    #[serde(default)]
    pub inputs: Vec<InputSchema>,
    #[serde(default)]
    pub groups: Vec<InputGroupSpec>,
    #[serde(default)]
    pub custom_elements: Vec<CustomElementSpec>,
    pub sections: Vec<SectionSpec>,
    #[serde(default)]
    pub element_overrides: Option<ElementOverrides>,
    #[serde(default)]
    pub resource_policy: Option<ResourcePolicySpec>,
    pub defaults: Option<DefaultsSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TemplateVariantSpec {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TemplateIdentity {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: Option<String>,
}

// ─── Package & Imports ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PackageSpec {
    pub name: String,
    pub version: String,
    #[ts(skip)]
    pub imports: Vec<ImportSymbol>,
    #[serde(default)]
    pub dependencies: Vec<PackageDependency>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PackageDependency {
    pub name: String,
    pub version: String,
    #[ts(skip)]
    pub imports: Vec<ImportSymbol>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ImportSymbol {
    Plain(String),
    Aliased { symbol: String, alias: String },
}

impl ImportSymbol {
    pub fn to_typst_import(&self) -> String {
        match self {
            ImportSymbol::Plain(name) => name.clone(),
            ImportSymbol::Aliased { symbol, alias } => format!("{symbol} as {alias}"),
        }
    }
}

// ─── Show Rule ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ShowRuleSpec {
    pub function: String,
    #[serde(default)]
    pub params: Vec<ParamSpec>,
    #[serde(default)]
    pub variants: Option<Vec<String>>,
}

// ─── Inputs Schema ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum InputType {
    String,
    Integer,
    Float,
    Boolean,
    Array,
    Object,
    Reference,
    Content,
    #[serde(rename = "simple_list")]
    SimpleList,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Importance {
    Required,
    Recommended,
    Optional,
}

impl Default for Importance {
    fn default() -> Self {
        Importance::Optional
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct InputSchema {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub input_type: InputType,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(type = "unknown")]
    pub default: Option<serde_json::Value>,
    #[serde(default)]
    pub importance: Importance,
    // When set, the input is only available for these variant ids.
    #[serde(default)]
    pub variants: Option<Vec<String>>,
    #[serde(default)]
    pub properties: Option<Vec<InputSchema>>,
    #[serde(default)]
    pub items: Option<Box<InputSchema>>,
    #[serde(default)]
    pub target: Option<String>,
}

// ─── Groups Schema ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct InputGroupSpec {
    pub id: String,
    pub label: String,
    pub inputs: Vec<String>,
    #[serde(default)]
    pub variants: Option<Vec<String>>,
}

// ─── Custom Elements Schema ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CustomElementSpec {
    pub kind: String,
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
    pub function: String,
    pub fields: Vec<ParamSpec>,
}

// ─── Parameters ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ParamSpec {
    pub key: String,
    #[serde(rename = "type")]
    pub param_type: ParamType,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    #[ts(type = "unknown")]
    pub default: Option<serde_json::Value>,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub variants: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ParamType {
    Content,
    String,
    Length,
    Boolean,
    Integer,
    Float,
    StringArray,
    ContentArray,
    Dictionary,
    AuthorList,
    AffiliationMap,
}

// ─── Sections ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SectionSpec {
    pub id: String,
    pub kind: SectionKind,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub function: Option<String>,
    #[serde(default)]
    pub params: Vec<ParamSpec>,
    #[serde(default)]
    pub variants: Option<Vec<String>>,
    // Literal Typst source for `literal` sections.
    #[serde(default)]
    pub source: Option<String>,
    // Bibliography file path for `bibliography` sections.
    #[serde(default)]
    pub file: Option<String>,
    // Section title in Typst.
    #[serde(default)]
    pub title: Option<String>,
    // Show rule function for `appendix` sections.
    #[serde(default)]
    pub show_rule: Option<String>,
    #[serde(default)]
    pub editable: Option<bool>,
    #[serde(default)]
    pub pagebreak_before: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum SectionKind {
    FunctionCall,
    Literal,
    Content,
    Bibliography,
    Appendix,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ExtraFieldSpec {
    pub key: String,
    #[serde(rename = "type")]
    pub param_type: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ElementOverrideSpec {
    pub function: Option<String>,
    pub wrapper: Option<String>,
    #[serde(default)]
    pub extra_fields: Vec<ExtraFieldSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ElementOverrides {
    pub figure: Option<ElementOverrideSpec>,
    pub table: Option<ElementOverrideSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ResourcePolicySpec {
    #[serde(default)]
    pub preview: Option<ResourcePreviewPolicySpec>,
    #[serde(default)]
    pub pasted_image: Option<PastedImagePolicySpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ResourcePreviewPolicySpec {
    #[serde(default)]
    pub width_pt: Option<f32>,
    #[serde(default)]
    pub margin_pt: Option<f32>,
    #[serde(default)]
    pub wrapper: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PastedImagePolicySpec {
    #[serde(default = "default_pasted_image_behavior")]
    pub behavior: String,
    #[serde(default)]
    pub wrapper: Option<String>,
}

fn default_pasted_image_behavior() -> String {
    "figure".to_string()
}

// ─── Defaults ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DefaultsSpec {
    #[serde(default)]
    pub paper_size: Option<String>,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub text_font: Option<String>,
    #[serde(default)]
    pub math_font: Option<String>,
    #[serde(default)]
    pub raw_font: Option<String>,
    #[serde(default)]
    pub font_size: Option<f32>,
    #[serde(default)]
    pub table_stroke_width: Option<f32>,
}

// ─── Loading ───────────────────────────────────────────────────────

pub fn plain_document_template() -> TemplateSpec {
    TemplateSpec {
        template: TemplateIdentity {
            id: "none".to_string(),
            name: "No template".to_string(),
            version: "1.0.0".to_string(),
            description: Some(
                "Minimal document without a bundled Typst template package".to_string(),
            ),
        },
        package: PackageSpec {
            name: String::new(),
            version: String::new(),
            imports: vec![],
            dependencies: vec![],
        },
        variants: vec![],
        show_rule: None,
        inputs: vec![InputSchema {
            id: Some("title".to_string()),
            input_type: InputType::String,
            label: Some("Title".to_string()),
            description: None,
            default: Some(serde_json::json!("")),
            importance: Importance::Recommended,
            variants: None,
            properties: None,
            items: None,
            target: None,
        }],
        groups: vec![],
        custom_elements: vec![],
        sections: vec![SectionSpec {
            id: "body".to_string(),
            kind: SectionKind::Content,
            label: None,
            function: None,
            params: vec![],
            variants: None,
            source: None,
            file: None,
            title: None,
            show_rule: None,
            editable: None,
            pagebreak_before: false,
        }],
        element_overrides: None,
        resource_policy: None,
        defaults: None,
    }
}

pub fn load_bundled_template(template_id: &str) -> Result<TemplateSpec, String> {
    if template_id == "none" {
        return Ok(plain_document_template());
    }

    static TEMPLATE_CACHE: std::sync::OnceLock<TemplateSpec> = std::sync::OnceLock::new();
    let spec = TEMPLATE_CACHE.get_or_init(|| {
        serde_json::from_str(VERSATILE_APA_TEMPLATE).expect("failed to parse bundled template spec")
    });

    match template_id {
        "versatile-apa" | "apa7" => Ok(spec.clone()),
        _ => Err(format!("unknown template: {template_id}")),
    }
}

/// UI-only variant: expose every input/group/section regardless of per-field `variants`.
pub const COMPLETE_TEMPLATE_VARIANT_ID: &str = "complete";

/// Variant id passed to Typst when the stored variant is UI-only.
pub fn typst_template_variant_id(variant_id: &str) -> &str {
    if variant_id == COMPLETE_TEMPLATE_VARIANT_ID {
        "student"
    } else {
        variant_id
    }
}

pub fn default_template_variant_id(spec: &TemplateSpec) -> String {
    spec.variants
        .iter()
        .find(|variant| variant.default)
        .map(|variant| variant.id.clone())
        .or_else(|| spec.variants.first().map(|variant| variant.id.clone()))
        .unwrap_or_else(|| "student".to_string())
}

pub fn resolve_template_variant(spec: &TemplateSpec, variant_id: Option<&str>) -> TemplateSpec {
    if spec.variants.is_empty() {
        return spec.clone();
    }

    let active_variant = variant_id
        .map(str::to_string)
        .filter(|id| spec.variants.iter().any(|variant| variant.id == *id))
        .unwrap_or_else(|| default_template_variant_id(spec));

    if active_variant == COMPLETE_TEMPLATE_VARIANT_ID {
        return spec.clone();
    }

    let mut resolved = spec.clone();
    resolved.inputs = spec
        .inputs
        .iter()
        .filter(|input| applies_to_variant(input.variants.as_ref(), &active_variant))
        .cloned()
        .collect();
    resolved.groups = spec
        .groups
        .iter()
        .filter(|group| applies_to_variant(group.variants.as_ref(), &active_variant))
        .map(|group| InputGroupSpec {
            inputs: group
                .inputs
                .iter()
                .filter(|input_id| {
                    spec.inputs.iter().any(|input| {
                        input.id.as_deref() == Some(input_id.as_str())
                            && applies_to_variant(input.variants.as_ref(), &active_variant)
                    })
                })
                .cloned()
                .collect(),
            ..group.clone()
        })
        .filter(|group| !group.inputs.is_empty())
        .collect();
    resolved.sections = spec
        .sections
        .iter()
        .filter(|section| applies_to_variant(section.variants.as_ref(), &active_variant))
        .map(|section| SectionSpec {
            params: section
                .params
                .iter()
                .filter(|param| applies_to_variant(param.variants.as_ref(), &active_variant))
                .cloned()
                .collect(),
            ..section.clone()
        })
        .collect();
    if let Some(show_rule) = spec.show_rule.as_ref() {
        resolved.show_rule = Some(ShowRuleSpec {
            params: show_rule
                .params
                .iter()
                .filter(|param| applies_to_variant(param.variants.as_ref(), &active_variant))
                .cloned()
                .collect(),
            ..show_rule.clone()
        });
    }
    resolved
}

fn applies_to_variant(variants: Option<&Vec<String>>, active_variant: &str) -> bool {
    if active_variant == COMPLETE_TEMPLATE_VARIANT_ID {
        return true;
    }

    match variants {
        None => true,
        Some(ids) if ids.is_empty() => true,
        Some(ids) => ids.iter().any(|id| id == active_variant),
    }
}

// ─── Typst Code Generation Helpers ─────────────────────────────────

impl PackageSpec {
    /// Generates the `#import` line for this package.
    pub fn to_typst_import_line(&self) -> String {
        let symbols: Vec<String> = self.imports.iter().map(|i| i.to_typst_import()).collect();
        format!(
            "#import \"{}:{}\": {}",
            self.name,
            self.version,
            symbols.join(", ")
        )
    }
}

impl PackageDependency {
    pub fn to_typst_import_line(&self) -> String {
        let symbols: Vec<String> = self.imports.iter().map(|i| i.to_typst_import()).collect();
        format!(
            "#import \"{}:{}\": {}",
            self.name,
            self.version,
            symbols.join(", ")
        )
    }
}

// ─── Tests ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_bundled_versatile_apa_template() {
        let spec = load_bundled_template("versatile-apa").expect("should parse");
        assert_eq!(spec.template.id, "versatile-apa");
        assert_eq!(spec.template.name, "APA 7th Edition");
        assert_eq!(spec.package.name, "@preview/versatile-apa");
        assert_eq!(spec.package.version, "7.2.0");
        assert_eq!(spec.variants.len(), 3);
        assert_eq!(spec.sections.len(), 6);
        assert!(spec.show_rule.is_some());
        assert!(!spec.inputs.is_empty());
        assert!(!spec.groups.is_empty());
        assert!(spec.defaults.is_some());
    }

    #[test]
    fn student_variant_omits_professional_only_fields() {
        let spec = load_bundled_template("versatile-apa").unwrap();
        let resolved = resolve_template_variant(&spec, Some("student"));
        let input_ids: Vec<_> = resolved
            .inputs
            .iter()
            .filter_map(|input| input.id.clone())
            .collect();
        assert!(input_ids.contains(&"course".to_string()));
        assert!(!input_ids.contains(&"running_head".to_string()));
        assert!(!input_ids.contains(&"author_note".to_string()));
        let show_rule = resolved.show_rule.expect("show rule");
        assert!(show_rule
            .params
            .iter()
            .all(|param| param.key != "running-head"));
        let title_page = resolved
            .sections
            .iter()
            .find(|section| section.id == "title-page")
            .expect("title page");
        let param_keys: Vec<_> = title_page
            .params
            .iter()
            .map(|param| param.key.as_str())
            .collect();
        assert!(param_keys.contains(&"course"));
        assert!(!param_keys.contains(&"author-note"));
    }

    #[test]
    fn complete_variant_includes_every_field() {
        let spec = load_bundled_template("versatile-apa").unwrap();
        let resolved = resolve_template_variant(&spec, Some("complete"));
        let input_ids: Vec<_> = resolved
            .inputs
            .iter()
            .filter_map(|input| input.id.clone())
            .collect();
        assert!(input_ids.contains(&"course".to_string()));
        assert!(input_ids.contains(&"running_head".to_string()));
        assert!(input_ids.contains(&"author_note".to_string()));
        let show_rule = resolved.show_rule.expect("show rule");
        assert!(show_rule
            .params
            .iter()
            .any(|param| param.key == "running-head"));
        let title_page = resolved
            .sections
            .iter()
            .find(|section| section.id == "title-page")
            .expect("title page");
        let param_keys: Vec<_> = title_page
            .params
            .iter()
            .map(|param| param.key.as_str())
            .collect();
        assert!(param_keys.contains(&"course"));
        assert!(param_keys.contains(&"author-note"));
    }

    #[test]
    fn professional_variant_omits_student_only_fields() {
        let spec = load_bundled_template("versatile-apa").unwrap();
        let resolved = resolve_template_variant(&spec, Some("professional"));
        let input_ids: Vec<_> = resolved
            .inputs
            .iter()
            .filter_map(|input| input.id.clone())
            .collect();
        assert!(input_ids.contains(&"running_head".to_string()));
        assert!(input_ids.contains(&"author_note".to_string()));
        assert!(!input_ids.contains(&"course".to_string()));
        let show_rule = resolved.show_rule.expect("show rule");
        assert!(show_rule
            .params
            .iter()
            .any(|param| param.key == "running-head"));
    }

    #[test]
    fn apa7_alias_loads_same_template() {
        let spec = load_bundled_template("apa7").expect("should parse");
        assert_eq!(spec.template.id, "versatile-apa");
    }

    #[test]
    fn plain_template_has_no_package_imports() {
        let spec = load_bundled_template("none").unwrap();
        assert_eq!(spec.template.id, "none");
        assert!(spec.show_rule.is_none());
        assert!(spec.package.name.is_empty());
    }

    #[test]
    fn unknown_template_returns_error() {
        let result = load_bundled_template("unknown");
        assert!(result.is_err());
    }

    #[test]
    fn generates_import_line() {
        let spec = load_bundled_template("versatile-apa").unwrap();
        let line = spec.package.to_typst_import_line();
        assert!(line.starts_with("#import \"@preview/versatile-apa:7.2.0\": "));
        assert!(line.contains("title-page"));
        assert!(line.contains("versatile-apa as apa-style"));
    }

    #[test]
    fn parses_show_rule_params() {
        let spec = load_bundled_template("versatile-apa").unwrap();
        let show_rule = spec.show_rule.unwrap();
        assert_eq!(show_rule.function, "apa-style");
        assert_eq!(show_rule.params.len(), 2);
        assert_eq!(show_rule.params[0].key, "font-size");
        assert_eq!(show_rule.params[0].param_type, ParamType::Length);
    }

    #[test]
    fn parses_section_kinds() {
        let spec = load_bundled_template("versatile-apa").unwrap();
        assert_eq!(spec.sections[0].kind, SectionKind::FunctionCall);
        assert_eq!(spec.sections[0].function.as_deref(), Some("title-page"));
        assert_eq!(spec.sections[2].kind, SectionKind::Literal);
        let outline_source = spec.sections[2]
            .source
            .as_deref()
            .expect("front matter outline literal");
        assert!(outline_source.starts_with("#outline()\n#pagebreak()\n"));
        assert!(outline_source.contains("figure.where(kind: table)"));
        assert!(outline_source.contains("appendix-outline"));
        assert_eq!(spec.sections[3].kind, SectionKind::Content);
        assert_eq!(spec.sections[4].kind, SectionKind::Bibliography);
        assert_eq!(spec.sections[5].kind, SectionKind::Appendix);
    }
}
