//! Type definitions for the template specification manifest.
//!
//! These structs/enums describe the shape of a bundled template's
//! `template.json` — the package imports, show rule, editor inputs, sections,
//! and defaults. The logic that loads, caches, and resolves variants lives in
//! the parent module.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ast::TemplateOverride;
use crate::quote_policy::QuotePolicySpec;

// ─── Template Spec Root ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TemplateSpec {
    pub metadata: TemplateMetadata,
    pub typst: TypstConfig,
    pub editor: EditorConfig,
    #[serde(default)]
    pub messages: std::collections::HashMap<String, std::collections::HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TemplateMetadata {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TypstConfig {
    pub package: PackageSpec,
    #[serde(default)]
    pub show_rule: Option<ShowRuleSpec>,
    #[serde(default)]
    pub sections: Vec<SectionSpec>,
    #[serde(default)]
    pub element_overrides: Option<ElementOverrides>,
    #[serde(default)]
    pub resource_policy: Option<ResourcePolicySpec>,
    #[serde(default)]
    pub default_template_overrides: Vec<TemplateOverride>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct EditorConfig {
    #[serde(default)]
    pub inputs: Vec<InputSchema>,
    #[serde(default)]
    pub groups: Vec<InputGroupSpec>,
    #[serde(default)]
    pub variants: Vec<TemplateVariantSpec>,
    #[serde(default)]
    pub custom_elements: Vec<CustomElementSpec>,
    #[serde(default)]
    pub defaults: Option<DefaultsSpec>,
    #[serde(default)]
    pub quote_policy: Option<QuotePolicySpec>,
    #[serde(default)]
    pub options: Vec<TemplateOptionSpec>,
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

    pub fn symbol_name(&self) -> &str {
        match self {
            ImportSymbol::Plain(name) => name.as_str(),
            ImportSymbol::Aliased { symbol, .. } => symbol.as_str(),
        }
    }
}

/// Whether the template manifest imports a Typst symbol from its package (or dependencies).
pub fn template_spec_exports_symbol(template: &TemplateSpec, symbol: &str) -> bool {
    template
        .typst
        .package
        .imports
        .iter()
        .any(|import| import.symbol_name() == symbol)
        || template.typst.package.dependencies.iter().any(|dependency| {
            dependency
                .imports
                .iter()
                .any(|import| import.symbol_name() == symbol)
        })
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
    /// Multi-paragraph rich text. Stored as an array of paragraphs (`RichText[][]`)
    /// and generated as content with `parbreak()` between paragraphs.
    #[serde(rename = "content_blocks")]
    ContentBlocks,
    #[serde(rename = "simple_list")]
    SimpleList,
    /// Inline or block math stored as `{ "syntax": "typst" | "latex", "source": "..." }`.
    Equation,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Importance {
    Required,
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

// ─── Template options (project settings) ───────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TemplateOptionSpec {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
    pub kind: TemplateOptionKind,
    #[serde(default)]
    #[ts(type = "unknown")]
    pub default: Option<serde_json::Value>,
    #[serde(default)]
    pub choices: Vec<TemplateOptionChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum TemplateOptionKind {
    Boolean,
    Choice,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TemplateOptionChoice {
    pub value: String,
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
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
    DegreeMap,
    Equation,
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
    /// Front-matter `#outline()` / `#pagebreak()` blocks from project outline settings.
    Outlines,
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
    /// Deprecated. Per-kind preview page sizing is defined by
    /// `ResourceKind::preview_page_size()` (`ResourcePreviewPageSize`).
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

// ─── Typst Code Generation Helpers ─────────────────────────────────

pub(crate) fn import_target(name: &str, version: &str) -> String {
    if version.is_empty() {
        name.to_string()
    } else {
        format!("{name}:{version}")
    }
}

impl PackageSpec {
    pub fn import_target(&self) -> String {
        import_target(&self.name, &self.version)
    }

    pub fn to_typst_import_line(&self) -> String {
        let symbols: Vec<String> = self.imports.iter().map(|i| i.to_typst_import()).collect();
        format!("#import \"{}\": {}", self.import_target(), symbols.join(", "))
    }
}

impl PackageDependency {
    pub fn to_typst_import_line(&self) -> String {
        let symbols: Vec<String> = self.imports.iter().map(|i| i.to_typst_import()).collect();
        format!(
            "#import \"{}\": {}",
            import_target(&self.name, &self.version),
            symbols.join(", ")
        )
    }
}
