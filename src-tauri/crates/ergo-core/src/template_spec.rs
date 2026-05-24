use serde::{Deserialize, Serialize};
use ts_rs::TS;

const VERSATILE_APA_TEMPLATE: &str =
    include_str!("../../../resources/templates/versatile-apa/template.json");


// ─── Template Spec Root ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct TemplateSpec {
    pub template: TemplateIdentity,
    pub package: PackageSpec,
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
#[ts(export, export_to = "../../src/bindings/")]
pub struct TemplateIdentity {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: Option<String>,
}

// ─── Package & Imports ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct PackageSpec {
    pub name: String,
    pub version: String,
    #[ts(skip)]
    pub imports: Vec<ImportSymbol>,
    #[serde(default)]
    pub dependencies: Vec<PackageDependency>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
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
#[ts(export, export_to = "../../src/bindings/")]
pub struct ShowRuleSpec {
    pub function: String,
    #[serde(default)]
    pub params: Vec<ParamSpec>,
}

// ─── Inputs Schema ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../src/bindings/")]
pub enum InputType {
    String,
    Integer,
    Float,
    Boolean,
    Array,
    Object,
    Reference,
    Content,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../src/bindings/")]
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
#[ts(export, export_to = "../../src/bindings/")]
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
    #[serde(default)]
    pub properties: Option<Vec<InputSchema>>,
    #[serde(default)]
    pub items: Option<Box<InputSchema>>,
    #[serde(default)]
    pub target: Option<String>,
}

// ─── Groups Schema ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct InputGroupSpec {
    pub id: String,
    pub label: String,
    pub inputs: Vec<String>,
}

// ─── Custom Elements Schema ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
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
#[ts(export, export_to = "../../src/bindings/")]
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
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../src/bindings/")]
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
#[ts(export, export_to = "../../src/bindings/")]
pub struct SectionSpec {
    pub id: String,
    pub kind: SectionKind,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub function: Option<String>,
    #[serde(default)]
    pub params: Vec<ParamSpec>,
    /// Literal Typst source (for `literal` kind).
    #[serde(default)]
    pub source: Option<String>,
    /// Bibliography file path (for `bibliography` kind).
    #[serde(default)]
    pub file: Option<String>,
    /// Section title in Typst (e.g. "References").
    #[serde(default)]
    pub title: Option<String>,
    /// Show rule function (for `appendix` kind).
    #[serde(default)]
    pub show_rule: Option<String>,
    #[serde(default)]
    pub editable: Option<bool>,
    #[serde(default)]
    pub pagebreak_before: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../src/bindings/")]
pub enum SectionKind {
    FunctionCall,
    Literal,
    Content,
    Bibliography,
    Appendix,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ExtraFieldSpec {
    pub key: String,
    #[serde(rename = "type")]
    pub param_type: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ElementOverrideSpec {
    pub function: Option<String>,
    pub wrapper: Option<String>,
    #[serde(default)]
    pub extra_fields: Vec<ExtraFieldSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ElementOverrides {
    pub figure: Option<ElementOverrideSpec>,
    pub table: Option<ElementOverrideSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ResourcePolicySpec {
    #[serde(default)]
    pub preview: Option<ResourcePreviewPolicySpec>,
    #[serde(default)]
    pub pasted_image: Option<PastedImagePolicySpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ResourcePreviewPolicySpec {
    #[serde(default)]
    pub width_pt: Option<f32>,
    #[serde(default)]
    pub margin_pt: Option<f32>,
    #[serde(default)]
    pub wrapper: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
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
#[ts(export, export_to = "../../src/bindings/")]
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

pub fn load_bundled_template(template_id: &str) -> Result<TemplateSpec, String> {
    static TEMPLATE_CACHE: std::sync::OnceLock<TemplateSpec> = std::sync::OnceLock::new();
    let spec = TEMPLATE_CACHE.get_or_init(|| {
        serde_json::from_str(VERSATILE_APA_TEMPLATE).expect("failed to parse bundled template spec")
    });

    match template_id {
        "versatile-apa" | "apa7" => Ok(spec.clone()),
        _ => Err(format!("unknown template: {template_id}")),
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
        assert_eq!(spec.sections.len(), 5);
        assert!(spec.show_rule.is_some());
        assert!(!spec.inputs.is_empty());
        assert!(!spec.groups.is_empty());
        assert!(spec.defaults.is_some());
    }

    #[test]
    fn apa7_alias_loads_same_template() {
        let spec = load_bundled_template("apa7").expect("should parse");
        assert_eq!(spec.template.id, "versatile-apa");
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
        assert_eq!(spec.sections[2].kind, SectionKind::Content);
        assert_eq!(spec.sections[3].kind, SectionKind::Bibliography);
        assert_eq!(spec.sections[4].kind, SectionKind::Appendix);
    }
}
