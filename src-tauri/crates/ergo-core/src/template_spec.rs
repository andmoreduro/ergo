use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ast::TemplateOverride;
use crate::quote_policy::QuotePolicySpec;

static TEMPLATES_DIR: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();
static CUSTOM_TEMPLATES_DIR: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();
static TEMPLATE_CACHE: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, TemplateSpec>>> = std::sync::OnceLock::new();

pub fn set_templates_dir(path: std::path::PathBuf) {
    let _ = TEMPLATES_DIR.set(path);
}

pub fn set_custom_templates_dir(path: std::path::PathBuf) {
    let _ = CUSTOM_TEMPLATES_DIR.set(path);
}

pub fn get_templates_dir() -> Option<&'static std::path::Path> {
    TEMPLATES_DIR.get().map(|p| p.as_path())
}

fn get_cached_template(template_id: &str) -> Option<TemplateSpec> {
    let cache = TEMPLATE_CACHE.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));
    let guard = cache.lock().unwrap();
    guard.get(template_id).cloned()
}

fn cache_template(template_id: &str, spec: TemplateSpec) {
    let cache = TEMPLATE_CACHE.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));
    let mut guard = cache.lock().unwrap();
    guard.insert(template_id.to_string(), spec);
}

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
        metadata: TemplateMetadata {
            id: "none".to_string(),
            name: "No template".to_string(),
            version: "1.0.0".to_string(),
            description: Some(
                "Minimal document without a bundled Typst template package".to_string(),
            ),
        },
        typst: TypstConfig {
            package: PackageSpec {
                name: String::new(),
                version: String::new(),
                imports: vec![],
                dependencies: vec![],
            },
            show_rule: None,
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
            default_template_overrides: plain_template_outline_defaults(),
        },
        editor: EditorConfig {
            inputs: vec![InputSchema {
                id: Some("title".to_string()),
                input_type: InputType::String,
                label: Some("Title".to_string()),
                description: None,
                default: Some(serde_json::json!("")),
                importance: Importance::Optional,
                variants: None,
                properties: None,
                items: None,
                target: None,
            }],
            groups: vec![],
            variants: vec![],
            custom_elements: vec![],
            defaults: None,
            quote_policy: None,
            options: vec![],
        },
        messages: std::collections::HashMap::new(),
    }
}

fn plain_template_outline_defaults() -> Vec<TemplateOverride> {
    const KEYS: &[&str] = &[
        "outline.include_contents",
        "outline.include_tables",
        "outline.include_figures",
        "outline.include_equations",
        "outline.include_listings",
        "outline.include_appendices",
    ];
    KEYS.iter()
        .map(|key| TemplateOverride {
            key: (*key).to_string(),
            value: "false".to_string(),
        })
        .collect()
}

#[cfg(not(target_arch = "wasm32"))]
pub fn load_template_from_zip(path: &std::path::Path) -> Result<TemplateSpec, String> {
    let file = std::fs::File::open(path)
        .map_err(|e| format!("failed to open template archive '{}': {}", path.display(), e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("failed to parse template archive '{}': {}", path.display(), e))?;

    // Find template.json
    let mut template_json_file = archive
        .by_name("template.json")
        .map_err(|e| format!("template.json not found in archive '{}': {}", path.display(), e))?;
    
    let mut template_json_str = String::new();
    std::io::Read::read_to_string(&mut template_json_file, &mut template_json_str)
        .map_err(|e| format!("failed to read template.json: {}", e))?;
    drop(template_json_file);

    let mut spec: TemplateSpec = serde_json::from_str(&template_json_str)
        .map_err(|e| format!("failed to parse template.json in '{}': {}", path.display(), e))?;

    // Read locales directory inside zip
    spec.messages = std::collections::HashMap::new();
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string().replace('\\', "/");
        if name.starts_with("locales/") && name.ends_with(".json") {
            let path_buf = std::path::PathBuf::from(&name);
            if let Some(stem) = path_buf.file_stem().and_then(|s| s.to_str()) {
                let mut locale_content = String::new();
                std::io::Read::read_to_string(&mut file, &mut locale_content)
                    .map_err(|e| format!("failed to read locale file '{}': {}", name, e))?;
                
                if let Ok(translations) = serde_json::from_str::<std::collections::HashMap<String, String>>(&locale_content) {
                    spec.messages.insert(stem.to_string(), translations);
                }
            }
        }
    }

    Ok(spec)
}

/// Resolve the template spec for an open project.
///
/// App-shipped templates (`apa7`, `umb-apa`) always track the binary: the bundled
/// manifest wins over any stale `.ergproj/template_spec.json` left in the VFS from a
/// prior session. Custom templates embedded in an archive keep using the VFS snapshot.
pub fn load_template_spec_for_project(
    vfs: &crate::vfs::VirtualFileSystem,
    ast: &crate::ast::DocumentAST,
) -> Result<TemplateSpec, String> {
    use crate::bundled_templates::{
        has_bundled_template_spec, sync_bundled_template_spec, TEMPLATE_SPEC_PATH,
    };

    let variant = ast
        .metadata
        .template_variant_id
        .as_deref()
        .map(typst_template_variant_id);

    if has_bundled_template_spec(&ast.metadata.template_id) {
        sync_bundled_template_spec(vfs, &ast.metadata.template_id)?;
        let spec = load_bundled_template(&ast.metadata.template_id)?;
        return Ok(resolve_template_variant(&spec, variant));
    }

    if let Ok(json) = vfs.read_source(TEMPLATE_SPEC_PATH) {
        let spec: TemplateSpec = serde_json::from_str(&json).map_err(|error| {
            format!("failed to parse {TEMPLATE_SPEC_PATH}: {error}")
        })?;
        if spec.metadata.id != ast.metadata.template_id {
            return Err(format!(
                "embedded template spec id `{}` does not match project template_id `{}`",
                spec.metadata.id, ast.metadata.template_id
            ));
        }
        return Ok(resolve_template_variant(&spec, variant));
    }

    let spec = load_bundled_template(&ast.metadata.template_id)?;
    Ok(resolve_template_variant(&spec, variant))
}

#[cfg(not(target_arch = "wasm32"))]
pub fn load_bundled_template(template_id: &str) -> Result<TemplateSpec, String> {
    if template_id == "none" {
        return Ok(plain_document_template());
    }

    if let Some(cached) = get_cached_template(template_id) {
        return Ok(cached);
    }

    // 1. Try custom templates directory first
    if let Some(custom_dir) = CUSTOM_TEMPLATES_DIR.get() {
        let path = custom_dir.join(format!("{template_id}.ergtemplate"));
        if path.exists() {
            if let Ok(spec) = load_template_from_zip(&path) {
                cache_template(template_id, spec.clone());
                return Ok(spec);
            }
        }
    }

    // 2. Fallback to bundled templates directory
    let mut templates_dir = None;
    if let Some(dir) = TEMPLATES_DIR.get() {
        templates_dir = Some(dir.clone());
    } else {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_default();
        let candidates = [
            std::path::PathBuf::from(&manifest_dir).join("../../../src-tauri/resources/templates"),
            std::path::PathBuf::from(&manifest_dir).join("resources/templates"),
            std::path::PathBuf::from(&manifest_dir).join("../resources/templates"),
            std::env::current_dir().unwrap_or_default().join("resources/templates"),
            std::env::current_dir().unwrap_or_default().join("src-tauri/resources/templates"),
        ];
        for candidate in candidates {
            if candidate.exists() {
                templates_dir = Some(candidate);
                break;
            }
        }
    }

    let templates_dir = templates_dir.ok_or_else(|| {
        format!(
            "could not locate templates directory (CARGO_MANIFEST_DIR: {}, current_dir: {})",
            std::env::var("CARGO_MANIFEST_DIR").unwrap_or_default(),
            std::env::current_dir().unwrap_or_default().display()
        )
    })?;

    let path = templates_dir.join(format!("{template_id}.ergtemplate"));
    if path.exists() {
        let spec = load_template_from_zip(&path)?;
        cache_template(template_id, spec.clone());
        return Ok(spec);
    }

    load_bundled_template_from_resources(template_id)
}

fn load_bundled_template_from_resources(template_id: &str) -> Result<TemplateSpec, String> {
    let (template_json, es_json) = match template_id {
        "apa7" => {
            let t = include_str!("../../../resources/templates/apa7/template.json");
            let es = include_str!("../../../resources/templates/apa7/locales/es.json");
            (t, Some(es))
        }
        "umb-apa" => {
            let t = include_str!("../../../resources/templates/umb-apa/template.json");
            let es = include_str!("../../../resources/templates/umb-apa/locales/es.json");
            (t, Some(es))
        }
        _ => {
            return Err(format!("unknown bundled template: {template_id}"));
        }
    };

    let mut spec: TemplateSpec = serde_json::from_str(template_json)
        .map_err(|e| format!("failed to parse static template {template_id}: {e}"))?;

    spec.messages = std::collections::HashMap::new();
    if let Some(es_content) = es_json {
        if let Ok(translations) =
            serde_json::from_str::<std::collections::HashMap<String, String>>(es_content)
        {
            spec.messages.insert("es".to_string(), translations);
        }
    }

    cache_template(template_id, spec.clone());
    Ok(spec)
}

#[cfg(target_arch = "wasm32")]
pub fn load_bundled_template(template_id: &str) -> Result<TemplateSpec, String> {
    if template_id == "none" {
        return Ok(plain_document_template());
    }

    if let Some(cached) = get_cached_template(template_id) {
        return Ok(cached);
    }

    load_bundled_template_from_resources(template_id)
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
    spec.editor
        .variants
        .iter()
        .find(|variant| variant.default)
        .map(|variant| variant.id.clone())
        .or_else(|| spec.editor.variants.first().map(|variant| variant.id.clone()))
        .unwrap_or_else(|| "student".to_string())
}

pub fn resolve_template_variant(spec: &TemplateSpec, variant_id: Option<&str>) -> TemplateSpec {
    if spec.editor.variants.is_empty() {
        return spec.clone();
    }

    let active_variant = variant_id
        .map(str::to_string)
        .filter(|id| spec.editor.variants.iter().any(|variant| variant.id == *id))
        .unwrap_or_else(|| default_template_variant_id(spec));

    if active_variant == COMPLETE_TEMPLATE_VARIANT_ID {
        return spec.clone();
    }

    let mut resolved = spec.clone();
    resolved.editor.inputs = spec
        .editor
        .inputs
        .iter()
        .filter(|input| applies_to_variant(input.variants.as_ref(), &active_variant))
        .cloned()
        .collect();
    resolved.editor.groups = spec
        .editor
        .groups
        .iter()
        .filter(|group| applies_to_variant(group.variants.as_ref(), &active_variant))
        .map(|group| InputGroupSpec {
            inputs: group
                .inputs
                .iter()
                .filter(|input_id| {
                    spec.editor.inputs.iter().any(|input| {
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
    resolved.typst.sections = spec
        .typst
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
    if let Some(show_rule) = spec.typst.show_rule.as_ref() {
        resolved.typst.show_rule = Some(ShowRuleSpec {
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

fn import_target(name: &str, version: &str) -> String {
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

// ─── Tests ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quote_policy::QuotePolicySpec;

    #[test]
    fn parses_apa7_template_spec() {
        let spec = load_bundled_template("apa7").expect("should parse");
        assert_eq!(spec.metadata.id, "apa7");
        assert_eq!(spec.metadata.name, "APA 7th Edition");
        assert_eq!(spec.typst.package.name, "/versatile-apa/lib.typ");
        assert_eq!(spec.typst.package.version, "");
        assert_eq!(spec.editor.variants.len(), 3);
        assert_eq!(spec.typst.sections.len(), 6);
        assert!(!spec.editor.inputs.is_empty());
        assert!(!spec.editor.groups.is_empty());
        assert!(spec.editor.defaults.is_some());
        assert_eq!(
            spec.editor.quote_policy,
            Some(QuotePolicySpec::ThresholdWords(40))
        );

        let show_rule = spec.typst.show_rule.as_ref().expect("show rule");
        assert_eq!(show_rule.function, "apa-style");
        assert_eq!(show_rule.params.len(), 2);
        assert_eq!(show_rule.params[0].key, "font-size");
        assert_eq!(show_rule.params[0].param_type, ParamType::Length);

        assert_eq!(spec.typst.sections[0].kind, SectionKind::FunctionCall);
        assert_eq!(spec.typst.sections[0].function.as_deref(), Some("title-page"));
        assert_eq!(spec.typst.sections[2].kind, SectionKind::Outlines);
        assert_eq!(spec.typst.sections[2].id, "front-matter-outlines");
        assert!(
            spec.typst.sections[2].source.as_deref().unwrap_or("").is_empty(),
            "outline Typst is generated by DocumentSession, not template literals"
        );
        assert_eq!(spec.typst.sections[3].kind, SectionKind::Content);
        assert_eq!(spec.typst.sections[4].kind, SectionKind::Bibliography);
        assert_eq!(spec.typst.sections[5].kind, SectionKind::Appendix);

        // Verify Spanish locales are loaded
        assert!(spec.messages.contains_key("es"), "should contain Spanish locales");
        let es_messages = spec.messages.get("es").unwrap();
        assert_eq!(es_messages.get("Student paper").map(|s| s.as_str()), Some("Trabajo de estudiante"));
    }

    #[test]
    fn template_variants_filter_inputs_and_show_rule_params() {
        let spec = load_bundled_template("apa7").unwrap();

        let student = resolve_template_variant(&spec, Some("student"));
        let student_inputs: Vec<_> = student
            .editor
            .inputs
            .iter()
            .filter_map(|input| input.id.clone())
            .collect();
        assert!(student_inputs.contains(&"course".to_string()));
        assert!(!student_inputs.contains(&"running_head".to_string()));
        assert!(!student_inputs.contains(&"author_note".to_string()));
        assert!(student
            .typst
            .show_rule
            .expect("show rule")
            .params
            .iter()
            .all(|param| param.key != "running-head"));

        let professional = resolve_template_variant(&spec, Some("professional"));
        let professional_inputs: Vec<_> = professional
            .editor
            .inputs
            .iter()
            .filter_map(|input| input.id.clone())
            .collect();
        assert!(professional_inputs.contains(&"running_head".to_string()));
        assert!(professional_inputs.contains(&"author_note".to_string()));
        assert!(!professional_inputs.contains(&"course".to_string()));

        let complete = resolve_template_variant(&spec, Some("complete"));
        let complete_inputs: Vec<_> = complete
            .editor
            .inputs
            .iter()
            .filter_map(|input| input.id.clone())
            .collect();
        assert!(complete_inputs.contains(&"course".to_string()));
        assert!(complete_inputs.contains(&"running_head".to_string()));
        assert!(complete_inputs.contains(&"author_note".to_string()));
        assert!(complete
            .typst
            .show_rule
            .expect("show rule")
            .params
            .iter()
            .any(|param| param.key == "running-head"));
    }

    #[test]
    fn plain_template_has_no_package_imports() {
        let spec = load_bundled_template("none").unwrap();
        assert_eq!(spec.metadata.id, "none");
        assert!(spec.typst.show_rule.is_none());
        assert!(spec.typst.package.name.is_empty());
        assert_eq!(spec.typst.default_template_overrides.len(), 6);
        assert!(
            spec.typst.default_template_overrides
                .iter()
                .all(|entry| entry.value == "false")
        );
    }

    #[test]
    fn unknown_template_returns_error() {
        let result = load_bundled_template("unknown");
        assert!(result.is_err());
    }

    #[test]
    fn generates_import_line() {
        let spec = load_bundled_template("apa7").unwrap();
        let line = spec.typst.package.to_typst_import_line();
        assert!(line.starts_with("#import \"/versatile-apa/lib.typ\": "));
        assert!(line.contains("title-page"));
        assert!(line.contains("versatile-apa as apa-style"));
    }

    #[test]
    fn umb_apa_template_imports_lib_by_path() {
        let spec = load_bundled_template("umb-apa").expect("should parse");
        assert_eq!(spec.metadata.id, "umb-apa");
        assert_eq!(spec.metadata.name, "UMB's APA7");
        assert_eq!(spec.typst.package.name, "/umb-apa/lib.typ");
        assert_eq!(spec.typst.package.version, "");
        
        // Assert umb-apa has no variants
        assert!(spec.editor.variants.is_empty(), "umb-apa should have no variants");

        let line = spec.typst.package.to_typst_import_line();
        assert!(
            line.starts_with("#import \"/umb-apa/lib.typ\": "),
            "got: {line}"
        );
        assert!(!line.contains("/umb-apa/lib.typ:"), "got: {line}");
        
        // Assert imports
        assert!(line.contains("front-matter"), "should import front-matter");
        assert!(line.contains("apa-style"), "should import apa-style from umb-apa lib");
        assert!(
            !line.contains("versatile-apa"),
            "UMB package should not re-export versatile-apa alias: {line}"
        );
        
        // Assert exposed inputs
        let input_ids: std::collections::HashSet<&str> = spec.editor.inputs.iter().filter_map(|input| input.id.as_deref()).collect();
        assert!(!input_ids.contains("running_head"));
        assert_eq!(spec.typst.default_template_overrides.len(), 4);
        assert!(
            spec.typst
                .default_template_overrides
                .iter()
                .any(|entry| entry.key == "outline.include_tables" && entry.value == "true")
        );
        assert!(
            spec.typst
                .default_template_overrides
                .iter()
                .any(|entry| entry.key == "outline.include_figures" && entry.value == "true")
        );
        let show_rule = spec.typst.show_rule.as_ref().expect("show_rule");
        assert!(
            !show_rule
                .params
                .iter()
                .any(|param| param.key == "running-head"),
            "UMB graduate works omit running heads"
        );
        assert!(input_ids.contains("advisor"));
        assert!(input_ids.contains("co_advisor"));
        assert!(input_ids.contains("titles"));
        assert!(input_ids.contains("faculties"));
        assert!(input_ids.contains("country"));
        assert!(input_ids.contains("city"));
        assert!(input_ids.contains("year"));
        assert!(input_ids.contains("authorities"));
        assert!(input_ids.contains("dedication"));
        assert!(input_ids.contains("symbols"));
        assert!(input_ids.contains("abbreviations"));
        assert!(input_ids.contains("acknowledgements"));
        assert!(input_ids.contains("abstract_es"));
        assert!(input_ids.contains("keywords_es"));
        assert!(input_ids.contains("abstract_en"));
        assert!(input_ids.contains("keywords_en"));
        
        // Assert unexposed inputs
        assert!(!input_ids.contains("course"));
        assert!(!input_ids.contains("instructor"));
        assert!(!input_ids.contains("due_date"));
        
        // Assert groups
        assert!(!spec.editor.groups.is_empty());
        assert_eq!(spec.editor.groups[0].id, "front_matter");
        assert!(
            spec.editor
                .groups
                .iter()
                .any(|group| group.id == "symbols_abbreviations")
        );

        let figure_overrides = spec
            .typst
            .element_overrides
            .as_ref()
            .and_then(|overrides| overrides.figure.as_ref())
            .expect("figure overrides");
        assert!(
            figure_overrides
                .extra_fields
                .iter()
                .any(|field| field.key == "source"),
            "figures should expose a source field"
        );
        
        // Assert sections
        assert!(!spec.typst.sections.is_empty());
        assert_eq!(spec.typst.sections[0].id, "front-matter");
        assert_eq!(spec.typst.sections[0].kind, SectionKind::FunctionCall);
        assert_eq!(spec.typst.sections[0].function.as_deref(), Some("front-matter"));
        
        assert_eq!(spec.typst.sections[1].id, "front-matter-outlines");
        assert_eq!(spec.typst.sections[1].kind, SectionKind::Outlines);

        assert_eq!(spec.typst.sections[2].id, "symbols");
        assert_eq!(spec.typst.sections[2].kind, SectionKind::FunctionCall);
        assert_eq!(spec.typst.sections[2].function.as_deref(), Some("symbols-page"));

        assert_eq!(spec.typst.sections[3].id, "abbreviations");
        assert_eq!(spec.typst.sections[3].kind, SectionKind::FunctionCall);
        assert_eq!(
            spec.typst.sections[3].function.as_deref(),
            Some("abbreviations-page")
        );

        assert_eq!(spec.typst.sections[4].id, "body");
        assert_eq!(spec.typst.sections[4].kind, SectionKind::Content);

        assert_eq!(spec.typst.sections[5].id, "references");
        assert_eq!(spec.typst.sections[5].kind, SectionKind::Bibliography);

        assert_eq!(spec.typst.sections[6].id, "appendices");
        assert_eq!(spec.typst.sections[6].kind, SectionKind::Appendix);

        // Verify Spanish locales are loaded
        assert!(spec.messages.contains_key("es"), "should contain Spanish locales");
        let es_messages = spec.messages.get("es").unwrap();
        assert_eq!(
            es_messages.get("Degrees").map(|s| s.as_str()),
            Some("Títulos")
        );
        assert_eq!(
            es_messages.get("Country").map(|s| s.as_str()),
            Some("País")
        );
    }

    #[test]
    fn bundled_template_spec_wins_over_stale_vfs_snapshot() {
        use crate::ast::DocumentAST;
        use crate::bundled_templates::TEMPLATE_SPEC_PATH;
        use crate::test_fixtures::default_umb_apa_project_ast;
        use crate::vfs::VirtualFileSystem;

        let vfs = VirtualFileSystem::new();
        let stale = TemplateSpec {
            metadata: TemplateMetadata {
                id: "umb-apa".to_string(),
                name: "Stale".to_string(),
                version: "0.0.0".to_string(),
                description: None,
            },
            typst: TypstConfig {
                package: PackageSpec {
                    name: "/umb-apa/lib.typ".to_string(),
                    version: String::new(),
                    imports: vec![],
                    dependencies: vec![],
                },
                show_rule: None,
                sections: vec![],
                element_overrides: None,
                resource_policy: None,
                default_template_overrides: vec![],
            },
            editor: EditorConfig {
                inputs: vec![],
                groups: vec![],
                variants: vec![],
                custom_elements: vec![],
                defaults: None,
                quote_policy: None,
                options: vec![],
            },
            messages: std::collections::HashMap::new(),
        };
        vfs.write_source(
            TEMPLATE_SPEC_PATH,
            serde_json::to_string(&stale).unwrap(),
        );

        let ast: DocumentAST = default_umb_apa_project_ast();
        let resolved = load_template_spec_for_project(&vfs, &ast).unwrap();

        assert_eq!(resolved.metadata.name, "UMB's APA7");
        assert!(
            resolved
                .editor
                .inputs
                .iter()
                .any(|input| input.id.as_deref() == Some("dedication"))
        );
        let refreshed: TemplateSpec =
            serde_json::from_str(&vfs.read_source(TEMPLATE_SPEC_PATH).unwrap()).unwrap();
        assert_eq!(refreshed.metadata.name, "UMB's APA7");
    }

    #[test]
    fn empty_version_yields_path_import_target() {
        assert_eq!(import_target("/umb-apa/lib.typ", ""), "/umb-apa/lib.typ");
        assert_eq!(
            import_target("@preview/versatile-apa", "7.2.0"),
            "@preview/versatile-apa:7.2.0"
        );
    }
}
