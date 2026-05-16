use std::collections::HashMap;

use crate::action_context::{contexts_may_overlap, parse_context_expression};
use crate::action_types::{KeymapConflict, KeymapValidationResult};
use crate::ast::{KeyBindingPreference, KeymapSettings};

pub(crate) fn effective_bindings(settings: &KeymapSettings) -> Vec<KeyBindingPreference> {
    let mut by_action_and_context = HashMap::new();

    for binding in &settings.keymap_bindings {
        by_action_and_context.insert(
            (binding.action_id, binding.context.clone()),
            binding.clone(),
        );
    }

    for binding in &settings.keymap_overrides {
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
