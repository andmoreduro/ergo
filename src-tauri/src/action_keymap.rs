use std::collections::HashMap;

use crate::action_context::{contexts_may_overlap, parse_context_expression};
use crate::action_types::{KeymapConflict, KeymapValidationResult};
use ergo_core::settings::{normalize_keymap_settings, KeyBindingPreference, KeymapSettings};

fn active_overrides(settings: &KeymapSettings) -> Vec<KeyBindingPreference> {
    if settings.profiles.is_empty() {
        return settings.keymap_overrides.clone();
    }

    settings
        .profiles
        .iter()
        .find(|profile| profile.id == settings.active_profile_id)
        .map(|profile| profile.overrides.clone())
        .unwrap_or_else(|| settings.keymap_overrides.clone())
}

/// A binding's identity for customization: the action it triggers, the context
/// expression it applies in, and the payload it carries (`InsertHeading` level 1
/// and level 2 are different bindings). Several bundled bindings may share one
/// identity — they are alternatives (`Ctrl+=` and `Ctrl++` both zoom in). A user
/// override replaces every alternative of its identity; an empty override
/// sequence unbinds the identity.
pub(crate) fn binding_identity(binding: &KeyBindingPreference) -> String {
    let payload = binding
        .payload
        .as_ref()
        .map(|value| value.to_string())
        .unwrap_or_default();
    format!("{}\u{1f}{}\u{1f}{}", binding.action_id, binding.context, payload)
}

pub(crate) fn effective_bindings(settings: &KeymapSettings) -> Vec<KeyBindingPreference> {
    let settings = normalize_keymap_settings(settings.clone());
    let overrides = active_overrides(&settings);

    // Ordered groups keep the bundled keymap's order (deterministic output for
    // settings rows and shortcut labels).
    let mut order: Vec<String> = Vec::new();
    let mut groups: HashMap<String, Vec<KeyBindingPreference>> = HashMap::new();

    for binding in &settings.keymap_bindings {
        let identity = binding_identity(binding);
        let group = groups.entry(identity.clone()).or_insert_with(|| {
            order.push(identity.clone());
            Vec::new()
        });
        group.push(binding.clone());
    }

    for binding in &overrides {
        let identity = binding_identity(binding);
        if binding.sequence.is_empty() {
            groups.remove(&identity);
            continue;
        }
        if !groups.contains_key(&identity) {
            order.push(identity.clone());
        }
        groups.insert(identity, vec![binding.clone()]);
    }

    order
        .into_iter()
        .filter_map(|identity| groups.remove(&identity))
        .flatten()
        .collect()
}

pub fn validate_keymap(settings: &KeymapSettings) -> KeymapValidationResult {
    let bindings = effective_bindings(settings);
    let mut conflicts = Vec::new();
    let mut errors = Vec::new();

    for binding in &bindings {
        if let Err(error) = parse_context_expression(&binding.context) {
            errors.push(format!("{}: {error}", binding.action_id));
        }
    }

    for (index, left) in bindings.iter().enumerate() {
        if left.sequence.is_empty() {
            continue;
        }

        for right in bindings.iter().skip(index + 1) {
            // Alternatives of one identity (same action, context and payload)
            // are not conflicts; anything else sharing a sequence in an
            // overlapping context is ambiguous.
            let same_identity = binding_identity(left) == binding_identity(right);
            if !same_identity
                && left.sequence == right.sequence
                && contexts_may_overlap(&left.context, &right.context)
            {
                conflicts.push(KeymapConflict {
                    action_id: left.action_id,
                    conflicting_action_id: right.action_id,
                    context: left.context.clone(),
                    conflicting_context: right.context.clone(),
                    sequence: left.sequence.clone(),
                    payload: left.payload.clone(),
                    conflicting_payload: right.payload.clone(),
                });
            }
        }
    }

    KeymapValidationResult { conflicts, errors }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::action_catalog::action_catalog;
    use crate::context_glossary::context_glossary;
    use std::collections::HashSet;

    /// Guards against drift between the action catalog, the bundled default
    /// keymap, and the context glossary: every context expression must parse and
    /// reference only known context names / attribute keys, and the shipped
    /// keymap must validate cleanly.
    #[test]
    fn catalog_and_default_keymap_reference_known_contexts() {
        let mut valid: HashSet<String> = HashSet::new();
        for context in context_glossary() {
            valid.insert(context.name.clone());
            for key in context.attribute_keys {
                valid.insert(key);
            }
        }

        let assert_known = |context: &str, source: &str| {
            let expression = parse_context_expression(context)
                .unwrap_or_else(|error| panic!("{source}: invalid context `{context}`: {error}"));
            let mut names = HashSet::new();
            expression.collect_referenced_names(&mut names);
            for name in names {
                assert!(
                    valid.contains(&name),
                    "{source}: context `{context}` references unknown identifier `{name}`",
                );
            }
        };

        for descriptor in action_catalog() {
            assert_known(
                &descriptor.default_context,
                &format!("catalog {}", descriptor.id),
            );
        }

        let default_keymap: KeymapSettings =
            serde_json::from_str(include_str!("../defaults/default_keymap.json"))
                .expect("default keymap parses");
        for binding in &default_keymap.keymap_bindings {
            assert_known(&binding.context, &format!("keymap {}", binding.action_id));
        }

        let validation = validate_keymap(&default_keymap);
        assert!(
            validation.errors.is_empty(),
            "default keymap has context errors: {:?}",
            validation.errors,
        );
        assert!(
            validation.conflicts.is_empty(),
            "default keymap has binding conflicts: {:?}",
            validation.conflicts,
        );
    }

    use crate::ast::{parse_key_sequence, ActionId};
    use ergo_core::settings::KeymapProfileRecord;

    fn binding(action_id: ActionId, context: &str, keys: &str, payload: Option<serde_json::Value>) -> KeyBindingPreference {
        // `parse_key_sequence` cannot spell a literal "+" key; build it by hand.
        let sequence = if keys == "Ctrl++" {
            vec![crate::ast::KeyStroke {
                key: "+".to_string(),
                modifiers: vec![crate::ast::KeyModifier::Control],
            }]
        } else {
            parse_key_sequence(keys).unwrap()
        };
        KeyBindingPreference {
            action_id,
            context: context.to_string(),
            sequence,
            payload,
        }
    }

    fn settings_with(bundled: Vec<KeyBindingPreference>, overrides: Vec<KeyBindingPreference>) -> KeymapSettings {
        KeymapSettings {
            keymap_profile: Some("Custom".to_string()),
            keymap_bindings: bundled,
            keymap_overrides: vec![],
            active_profile_id: "custom".to_string(),
            profiles: vec![
                KeymapProfileRecord { id: "default".to_string(), name: "Default".to_string(), overrides: vec![] },
                KeymapProfileRecord { id: "custom".to_string(), name: "Custom".to_string(), overrides },
            ],
        }
    }

    /// The bundled keymap ships alternatives (`Ctrl+=` and `Ctrl++` zoom in) and
    /// payload variants (heading levels). Merging must keep all of them.
    #[test]
    fn effective_bindings_keep_alternatives_and_payload_variants() {
        let settings = settings_with(
            vec![
                binding(ActionId::ViewZoomIn, "workspace", "Ctrl+=", None),
                binding(ActionId::ViewZoomIn, "workspace", "Ctrl++", None),
                binding(ActionId::EditorInsertHeading, "editor", "Ctrl+Alt+Shift+1", Some(serde_json::json!({"level": 1}))),
                binding(ActionId::EditorInsertHeading, "editor", "Ctrl+Alt+Shift+2", Some(serde_json::json!({"level": 2}))),
            ],
            vec![],
        );
        let effective = effective_bindings(&settings);
        assert_eq!(effective.len(), 4);
        assert!(validate_keymap(&settings).conflicts.is_empty());
    }

    /// An override replaces every alternative of its identity; an empty override
    /// removes the identity; other identities of the same action are untouched.
    #[test]
    fn overrides_replace_or_remove_whole_identity() {
        let settings = settings_with(
            vec![
                binding(ActionId::ViewZoomIn, "workspace", "Ctrl+=", None),
                binding(ActionId::ViewZoomIn, "workspace", "Ctrl++", None),
                binding(ActionId::EditorInsertHeading, "editor", "Ctrl+Alt+Shift+1", Some(serde_json::json!({"level": 1}))),
                binding(ActionId::EditorInsertHeading, "editor", "Ctrl+Alt+Shift+2", Some(serde_json::json!({"level": 2}))),
            ],
            vec![
                binding(ActionId::ViewZoomIn, "workspace", "Ctrl+Shift+Z", None),
                KeyBindingPreference {
                    action_id: ActionId::EditorInsertHeading,
                    context: "editor".to_string(),
                    sequence: vec![],
                    payload: Some(serde_json::json!({"level": 2})),
                },
            ],
        );
        let effective = effective_bindings(&settings);
        let zoom: Vec<_> = effective.iter().filter(|b| b.action_id == ActionId::ViewZoomIn).collect();
        assert_eq!(zoom.len(), 1);
        assert_eq!(zoom[0].sequence, parse_key_sequence("Ctrl+Shift+Z").unwrap());
        let headings: Vec<_> = effective.iter().filter(|b| b.action_id == ActionId::EditorInsertHeading).collect();
        assert_eq!(headings.len(), 1);
        assert_eq!(headings[0].payload, Some(serde_json::json!({"level": 1})));
    }

    /// Two payload variants bound to the same chord are a real conflict.
    #[test]
    fn same_action_different_payload_conflicts() {
        let settings = settings_with(
            vec![
                binding(ActionId::EditorInsertHeading, "editor", "Ctrl+Alt+Shift+1", Some(serde_json::json!({"level": 1}))),
                binding(ActionId::EditorInsertHeading, "editor", "Ctrl+Alt+Shift+1", Some(serde_json::json!({"level": 2}))),
            ],
            vec![],
        );
        assert_eq!(validate_keymap(&settings).conflicts.len(), 1);
    }
}
