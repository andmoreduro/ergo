use std::collections::HashMap;

use crate::action_context::{contexts_may_overlap, parse_context_expression};
use crate::action_types::{KeymapConflict, KeymapValidationResult};
use crate::ast::{KeyBindingPreference, KeymapSettings, normalize_keymap_settings};

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

pub(crate) fn effective_bindings(settings: &KeymapSettings) -> Vec<KeyBindingPreference> {
    let settings = normalize_keymap_settings(settings.clone());
    let overrides = active_overrides(&settings);
    let mut by_action_and_context = HashMap::new();

    for binding in &settings.keymap_bindings {
        by_action_and_context.insert(
            (binding.action_id, binding.context.clone()),
            binding.clone(),
        );
    }

    for binding in &overrides {
        let key = (binding.action_id, binding.context.clone());
        if binding.sequence.is_empty() {
            by_action_and_context.remove(&key);
        } else {
            by_action_and_context.insert(key, binding.clone());
        }
    }

    by_action_and_context.into_values().collect()
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
            if left.sequence == right.sequence
                && contexts_may_overlap(&left.context, &right.context)
            {
                conflicts.push(KeymapConflict {
                    action_id: left.action_id,
                    conflicting_action_id: right.action_id,
                    context: left.context.clone(),
                    sequence: left.sequence.clone(),
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
}
