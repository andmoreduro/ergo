mod types;

pub use types::*;

use crate::ast::TemplateOverride;
use crate::core_errors::ErgoError;

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
pub fn load_template_from_zip(path: &std::path::Path) -> Result<TemplateSpec, ErgoError> {
    let file = std::fs::File::open(path).map_err(|e| ErgoError::Operation {
        message: format!("failed to open template archive '{}': {}", path.display(), e),
    })?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| ErgoError::Operation {
        message: format!("failed to parse template archive '{}': {}", path.display(), e),
    })?;

    // Find template.json
    let mut template_json_file = archive.by_name("template.json").map_err(|e| ErgoError::Operation {
        message: format!("template.json not found in archive '{}': {}", path.display(), e),
    })?;

    let mut template_json_str = String::new();
    std::io::Read::read_to_string(&mut template_json_file, &mut template_json_str).map_err(
        |e| ErgoError::Operation {
            message: format!("failed to read template.json: {}", e),
        },
    )?;
    drop(template_json_file);

    let mut spec: TemplateSpec = serde_json::from_str(&template_json_str).map_err(|e| {
        ErgoError::Operation {
            message: format!("failed to parse template.json in '{}': {}", path.display(), e),
        }
    })?;

    // Read locales directory inside zip
    spec.messages = std::collections::HashMap::new();
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| ErgoError::Operation {
            message: e.to_string(),
        })?;
        let name = file.name().to_string().replace('\\', "/");
        if name.starts_with("locales/") && name.ends_with(".json") {
            let path_buf = std::path::PathBuf::from(&name);
            if let Some(stem) = path_buf.file_stem().and_then(|s| s.to_str()) {
                let mut locale_content = String::new();
                std::io::Read::read_to_string(&mut file, &mut locale_content).map_err(|e| {
                    ErgoError::Operation {
                        message: format!("failed to read locale file '{}': {}", name, e),
                    }
                })?;
                
                if let Ok(translations) = serde_json::from_str::<std::collections::HashMap<String, String>>(&locale_content) {
                    spec.messages.insert(stem.to_string(), translations);
                }
            }
        }
    }

    Ok(spec)
}

/// Resolve the template spec for an open project. Pure read — does not mutate
/// the VFS. Callers that need the bundled spec written to `.ergproj/` (e.g. on
/// save) call `sync_bundled_template_spec` separately.
///
/// App-shipped templates (`apa7`, `umb-apa`) always track the binary: the bundled
/// manifest wins over any stale `.ergproj/template_spec.json` left in the VFS from a
/// prior session. Custom templates embedded in an archive keep using the VFS snapshot.
pub fn load_template_spec_for_project(
    vfs: &crate::vfs::VirtualFileSystem,
    ast: &crate::ast::DocumentAST,
) -> Result<TemplateSpec, ErgoError> {
    use crate::bundled_templates::{
        has_bundled_template_spec, TEMPLATE_SPEC_PATH,
    };

    let variant = ast
        .metadata
        .template_variant_id
        .as_deref()
        .map(typst_template_variant_id);

    if has_bundled_template_spec(&ast.metadata.template_id) {
        let spec = load_bundled_template(&ast.metadata.template_id)?;
        return Ok(resolve_template_variant(&spec, variant));
    }

    if let Ok(json) = vfs.read_source(TEMPLATE_SPEC_PATH) {
        let spec: TemplateSpec = serde_json::from_str(&json).map_err(|error| {
            ErgoError::Operation {
                message: format!("failed to parse {TEMPLATE_SPEC_PATH}: {error}"),
            }
        })?;
        if spec.metadata.id != ast.metadata.template_id {
            return Err(ErgoError::Operation {
                message: format!(
                    "embedded template spec id `{}` does not match project template_id `{}`",
                    spec.metadata.id, ast.metadata.template_id
                ),
            });
        }
        return Ok(resolve_template_variant(&spec, variant));
    }

    let spec = load_bundled_template(&ast.metadata.template_id)?;
    Ok(resolve_template_variant(&spec, variant))
}

#[cfg(not(target_arch = "wasm32"))]
pub fn load_bundled_template(template_id: &str) -> Result<TemplateSpec, ErgoError> {
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
        ErgoError::Operation {
            message: format!(
                "could not locate templates directory (CARGO_MANIFEST_DIR: {}, current_dir: {})",
                std::env::var("CARGO_MANIFEST_DIR").unwrap_or_default(),
                std::env::current_dir().unwrap_or_default().display()
            ),
        }
    })?;

    let path = templates_dir.join(format!("{template_id}.ergtemplate"));
    if path.exists() {
        let spec = load_template_from_zip(&path)?;
        cache_template(template_id, spec.clone());
        return Ok(spec);
    }

    load_bundled_template_from_resources(template_id)
}

fn load_bundled_template_from_resources(template_id: &str) -> Result<TemplateSpec, ErgoError> {
    let (template_json, es_json) = match template_id {
        "apa7" => {
            let t = include_str!("../../../../resources/templates/apa7/template.json");
            let es = include_str!("../../../../resources/templates/apa7/locales/es.json");
            (t, Some(es))
        }
        "umb-apa" => {
            let t = include_str!("../../../../resources/templates/umb-apa/template.json");
            let es = include_str!("../../../../resources/templates/umb-apa/locales/es.json");
            (t, Some(es))
        }
        _ => {
            return Err(ErgoError::Operation {
                message: format!("unknown bundled template: {template_id}"),
            });
        }
    };

    let mut spec: TemplateSpec = serde_json::from_str(template_json).map_err(|e| {
        ErgoError::Operation {
            message: format!("failed to parse static template {template_id}: {e}"),
        }
    })?;

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
pub fn load_bundled_template(template_id: &str) -> Result<TemplateSpec, ErgoError> {
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

// ─── Tests ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quote_policy::QuotePolicySpec;

    #[test]
    fn deserializes_template_spec_schema_from_inline_json() {
        let json = serde_json::json!({
            "metadata": { "id": "fixture", "name": "Fixture", "version": "1" },
            "typst": {
                "package": { "name": "/fixture/lib.typ", "version": "", "imports": [] },
                "show_rule": {
                    "function": "fixture-style",
                    "params": [
                        { "key": "font-size", "type": "length" },
                        { "key": "two-column", "type": "boolean" }
                    ]
                },
                "sections": [
                    { "id": "title", "kind": "function_call", "function": "title-page" },
                    { "id": "front", "kind": "outlines" },
                    { "id": "body", "kind": "content" },
                    { "id": "refs", "kind": "bibliography", "file": "references.bib" },
                    { "id": "appx", "kind": "appendix" },
                    { "id": "lit", "kind": "literal", "source": "#pagebreak()" }
                ]
            },
            "editor": {
                "variants": [ { "id": "student", "label": "Student", "default": true } ],
                "inputs": [
                    {
                        "id": "authors",
                        "type": "array",
                        "importance": "required",
                        "items": {
                            "type": "object",
                            "properties": [
                                { "id": "name", "type": "string" },
                                { "id": "affiliations", "type": "array" }
                            ]
                        }
                    }
                ],
                "groups": [ { "id": "front_matter", "label": "Front matter", "inputs": ["authors"] } ],
                "quote_policy": 40
            },
            "messages": {
                "es": { "Student paper": "Trabajo de estudiante" }
            }
        });

        let spec: TemplateSpec = serde_json::from_value(json).expect("fixture spec should parse");

        assert_eq!(spec.typst.package.name, "/fixture/lib.typ");
        let show_rule = spec.typst.show_rule.expect("show rule");
        assert_eq!(show_rule.params[0].param_type, ParamType::Length);
        assert_eq!(show_rule.params[1].param_type, ParamType::Boolean);

        let kinds: Vec<&SectionKind> = spec.typst.sections.iter().map(|s| &s.kind).collect();
        assert_eq!(
            kinds,
            vec![
                &SectionKind::FunctionCall,
                &SectionKind::Outlines,
                &SectionKind::Content,
                &SectionKind::Bibliography,
                &SectionKind::Appendix,
                &SectionKind::Literal,
            ]
        );
        assert_eq!(spec.typst.sections[0].function.as_deref(), Some("title-page"));
        assert_eq!(
            spec.typst.sections[5].source.as_deref(),
            Some("#pagebreak()")
        );
        // Outlines sections carry no literal source: DocumentSession generates it.
        assert!(spec.typst.sections[1].source.as_deref().unwrap_or("").is_empty());

        assert_eq!(
            spec.editor.quote_policy,
            Some(QuotePolicySpec::ThresholdWords(40))
        );
        assert_eq!(spec.editor.variants.len(), 1);
        assert!(spec.editor.variants[0].default);
        let authors = &spec.editor.inputs[0];
        assert_eq!(authors.input_type, InputType::Array);
        assert_eq!(authors.importance, Importance::Required);
        let items = authors.items.as_ref().expect("items");
        let properties = items.properties.as_ref().expect("properties");
        assert_eq!(properties.len(), 2);
        assert_eq!(spec.editor.groups[0].inputs, vec!["authors".to_string()]);

        assert_eq!(
            spec.messages["es"]["Student paper"],
            "Trabajo de estudiante"
        );
    }

    #[test]
    fn quote_policy_deserializes_threshold_and_mode_forms() {
        let threshold: QuotePolicySpec = serde_json::from_value(serde_json::json!(25)).unwrap();
        assert_eq!(threshold, QuotePolicySpec::ThresholdWords(25));
        let mode: QuotePolicySpec = serde_json::from_value(serde_json::json!("block")).unwrap();
        assert_eq!(mode, QuotePolicySpec::Mode("block".to_string()));
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
    fn bundled_templates_parse_and_import_lib_by_path() {
        for template_id in ["apa7", "umb-apa"] {
            let spec = load_bundled_template(template_id)
                .unwrap_or_else(|error| panic!("{template_id} should parse: {error}"));
            assert!(
                spec.typst.package.name.starts_with('/'),
                "{template_id} package should be a lib.typ path"
            );
            assert!(
                spec.typst
                    .package
                    .to_typst_import_line()
                    .starts_with(&format!("#import \"{}\": ", spec.typst.package.name)),
                "{template_id} should import its lib by path"
            );
        }
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

        // The bundled spec wins regardless of the stale VFS snapshot.
        assert_eq!(
            serde_json::to_value(&resolved).unwrap(),
            serde_json::to_value(&load_bundled_template("umb-apa").unwrap()).unwrap()
        );

        // load_template_spec_for_project is a pure read — the VFS still holds
        // the stale snapshot until the caller explicitly syncs it.
        let still_stale: TemplateSpec =
            serde_json::from_str(&vfs.read_source(TEMPLATE_SPEC_PATH).unwrap()).unwrap();
        assert_eq!(still_stale.metadata.name, "Stale");

        // The caller syncs the bundled spec into the VFS explicitly.
        crate::bundled_templates::sync_bundled_template_spec(&vfs, "umb-apa").unwrap();
        let refreshed: TemplateSpec =
            serde_json::from_str(&vfs.read_source(TEMPLATE_SPEC_PATH).unwrap()).unwrap();
        assert_eq!(
            serde_json::to_value(&refreshed).unwrap(),
            serde_json::to_value(&load_bundled_template("umb-apa").unwrap()).unwrap()
        );
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
