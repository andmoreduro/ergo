use crate::action_context::{parse_context_expression, ActiveContext};
use crate::action_keymap::effective_bindings;
use crate::ast::{
    normalize_key_name, ActionId, KeyBindingPreference, KeyModifier, KeyStroke, KeymapSettings,
};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::time::{Duration, Instant};

const KEY_SEQUENCE_TIMEOUT_MS: u32 = 900;

pub use crate::action_catalog::action_catalog;
pub use crate::action_keymap::validate_keymap;
pub use crate::action_types::{
    ActionContextNode, ActionContextSnapshot, ActionDescriptor, ActionInvocation, ActionResolution,
    KeymapConflict, KeymapValidationResult, LogicalKeyEvent,
};

#[derive(Default)]
pub struct ActionResolverState {
    pending: Mutex<HashMap<String, PendingSequence>>,
    keymap_cache: parking_lot::Mutex<Option<KeymapSettings>>,
}

pub fn refresh_cached_keymap(state: &ActionResolverState, settings: KeymapSettings) {
    *state.keymap_cache.lock() = Some(settings);
}

impl ActionResolverState {
    pub fn clear_pending_sequence(&self, window_id: &str) {
        self.pending.lock().remove(window_id);
    }

    pub fn cached_keymap(&self) -> Option<KeymapSettings> {
        self.keymap_cache.lock().clone()
    }

    pub fn cache_keymap(&self, settings: KeymapSettings) {
        *self.keymap_cache.lock() = Some(settings);
    }
}

#[derive(Debug, Clone)]
struct PendingSequence {
    sequence: Vec<KeyStroke>,
    fallback: Option<ActionInvocation>,
    expires_at: Instant,
}

#[derive(Debug, Clone)]
struct MatchedBinding {
    binding: KeyBindingPreference,
    specificity: usize,
}

pub fn resolve_key_event_with_settings(
    state: &ActionResolverState,
    settings: &KeymapSettings,
    event: LogicalKeyEvent,
    context_snapshot: ActionContextSnapshot,
) -> ActionResolution {
    let stroke = normalize_logical_event(&event);
    let now = Instant::now();
    let pending = {
        let mut pending_by_window = state.pending.lock();
        pending_by_window
            .remove(&event.window_id)
            .filter(|pending| pending.expires_at > now)
    };

    let mut sequence = pending
        .as_ref()
        .map(|pending| pending.sequence.clone())
        .unwrap_or_default();
    sequence.push(stroke);

    let active_context = ActiveContext::from_snapshot(&context_snapshot);
    let effective_bindings = effective_bindings(settings);
    let matching = matching_bindings(&effective_bindings, &sequence, &active_context);
    let exact = choose_best_exact(&matching, sequence.len());
    let has_longer_match = matching
        .iter()
        .any(|binding| binding.binding.sequence.len() > sequence.len());

    match (exact, has_longer_match) {
        (Some(exact), true) => {
            state.pending.lock().insert(
                event.window_id.clone(),
                PendingSequence {
                    sequence: sequence.clone(),
                    fallback: Some(invocation(exact.binding.action_id)),
                    expires_at: now + Duration::from_millis(u64::from(KEY_SEQUENCE_TIMEOUT_MS)),
                },
            );

            ActionResolution::PendingSequence {
                sequence,
                fallback: Some(invocation(exact.binding.action_id)),
                timeout_ms: KEY_SEQUENCE_TIMEOUT_MS,
            }
        }
        (Some(exact), false) => ActionResolution::Matched {
            invocation: invocation(exact.binding.action_id),
        },
        (None, true) => {
            state.pending.lock().insert(
                event.window_id.clone(),
                PendingSequence {
                    sequence: sequence.clone(),
                    fallback: pending.and_then(|pending| pending.fallback),
                    expires_at: now + Duration::from_millis(u64::from(KEY_SEQUENCE_TIMEOUT_MS)),
                },
            );

            ActionResolution::PendingSequence {
                sequence,
                fallback: None,
                timeout_ms: KEY_SEQUENCE_TIMEOUT_MS,
            }
        }
        (None, false) if pending.is_some() => ActionResolution::Cancelled,
        (None, false) => ActionResolution::NoMatch,
    }
}

fn normalize_logical_event(event: &LogicalKeyEvent) -> KeyStroke {
    let mut modifiers = event.modifiers.clone();
    sort_modifiers(&mut modifiers);

    KeyStroke {
        key: normalize_key_name(&event.key),
        modifiers,
    }
}

fn sort_modifiers(modifiers: &mut Vec<KeyModifier>) {
    modifiers.sort_by_key(|modifier| match modifier {
        KeyModifier::Control => 0,
        KeyModifier::Alt => 1,
        KeyModifier::Shift => 2,
        KeyModifier::Meta => 3,
    });
    modifiers.dedup();
}

fn invocation(id: ActionId) -> ActionInvocation {
    ActionInvocation { id, payload: None }
}

fn matching_bindings(
    bindings: &[KeyBindingPreference],
    sequence: &[KeyStroke],
    active_context: &ActiveContext,
) -> Vec<MatchedBinding> {
    bindings
        .iter()
        .filter(|binding| binding.sequence.starts_with(sequence))
        .filter_map(|binding| {
            let expression = parse_context_expression(&binding.context).ok()?;
            if expression.evaluate(active_context) {
                Some(MatchedBinding {
                    binding: binding.clone(),
                    specificity: expression.specificity(),
                })
            } else {
                None
            }
        })
        .collect()
}

fn choose_best_exact(bindings: &[MatchedBinding], length: usize) -> Option<MatchedBinding> {
    bindings
        .iter()
        .filter(|binding| binding.binding.sequence.len() == length)
        .max_by_key(|binding| binding.specificity)
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::parse_key_sequence;
    use std::collections::HashSet;

    fn snapshot(focused_context_id: &str, nodes: Vec<ActionContextNode>) -> ActionContextSnapshot {
        ActionContextSnapshot {
            window_id: "main".to_string(),
            focused_context_id: Some(focused_context_id.to_string()),
            nodes,
        }
    }

    fn node(
        id: &str,
        parent_id: Option<&str>,
        contexts: &[&str],
        attributes: &[(&str, &str)],
    ) -> ActionContextNode {
        ActionContextNode {
            id: id.to_string(),
            parent_id: parent_id.map(str::to_string),
            contexts: contexts.iter().map(|value| value.to_string()).collect(),
            attributes: attributes
                .iter()
                .map(|(key, value)| ((*key).to_string(), (*value).to_string()))
                .collect(),
        }
    }

    fn binding(action_id: ActionId, context: &str, sequence: &str) -> KeyBindingPreference {
        KeyBindingPreference {
            action_id,
            context: context.to_string(),
            sequence: parse_key_sequence(sequence).unwrap(),
        }
    }

    #[test]
    fn parses_context_expressions_with_boolean_operators_and_equality() {
        let expression =
            parse_context_expression("workspace && !input && element.kind == \"Heading\"").unwrap();
        let active = ActiveContext {
            names: HashSet::from([
                "app".to_string(),
                "workspace".to_string(),
                "element".to_string(),
            ]),
            attributes: HashMap::from([("element.kind".to_string(), "Heading".to_string())]),
        };

        assert!(expression.evaluate(&active));
    }

    #[test]
    fn resolves_single_stroke_logical_keybindings() {
        let settings = KeymapSettings {
            keymap_profile: Some("Default".to_string()),
            keymap_bindings: vec![binding(
                ActionId::ViewOpenCommandPalette,
                "app",
                "Ctrl+Shift+P",
            )],
            keymap_overrides: Vec::new(),
        };
        let state = ActionResolverState::default();

        let resolution = resolve_key_event_with_settings(
            &state,
            &settings,
            LogicalKeyEvent {
                window_id: "main".to_string(),
                key: "P".to_string(),
                modifiers: vec![KeyModifier::Shift, KeyModifier::Control],
            },
            snapshot("app", vec![node("app", None, &["app"], &[])]),
        );

        assert!(matches!(
            resolution,
            ActionResolution::Matched {
                invocation: ActionInvocation {
                    id: ActionId::ViewOpenCommandPalette,
                    ..
                }
            }
        ));
    }

    #[test]
    fn resolves_multi_stroke_sequences() {
        let settings = KeymapSettings {
            keymap_profile: Some("Default".to_string()),
            keymap_bindings: vec![binding(
                ActionId::WorkspaceOpenRecentProject,
                "app",
                "Ctrl+O Ctrl+R",
            )],
            keymap_overrides: Vec::new(),
        };
        let state = ActionResolverState::default();
        let context = snapshot("app", vec![node("app", None, &["app"], &[])]);

        let first = resolve_key_event_with_settings(
            &state,
            &settings,
            LogicalKeyEvent {
                window_id: "main".to_string(),
                key: "o".to_string(),
                modifiers: vec![KeyModifier::Control],
            },
            context.clone(),
        );
        let second = resolve_key_event_with_settings(
            &state,
            &settings,
            LogicalKeyEvent {
                window_id: "main".to_string(),
                key: "r".to_string(),
                modifiers: vec![KeyModifier::Control],
            },
            context,
        );

        assert!(matches!(first, ActionResolution::PendingSequence { .. }));
        assert!(matches!(
            second,
            ActionResolution::Matched {
                invocation: ActionInvocation {
                    id: ActionId::WorkspaceOpenRecentProject,
                    ..
                }
            }
        ));
    }

    #[test]
    fn returns_pending_fallback_when_exact_match_is_also_a_prefix() {
        let settings = KeymapSettings {
            keymap_profile: Some("Default".to_string()),
            keymap_bindings: vec![
                binding(ActionId::WorkspaceOpenProject, "app", "Ctrl+O"),
                binding(ActionId::WorkspaceOpenRecentProject, "app", "Ctrl+O Ctrl+R"),
            ],
            keymap_overrides: Vec::new(),
        };
        let state = ActionResolverState::default();

        let resolution = resolve_key_event_with_settings(
            &state,
            &settings,
            LogicalKeyEvent {
                window_id: "main".to_string(),
                key: "o".to_string(),
                modifiers: vec![KeyModifier::Control],
            },
            snapshot("app", vec![node("app", None, &["app"], &[])]),
        );

        assert!(matches!(
            resolution,
            ActionResolution::PendingSequence {
                fallback: Some(ActionInvocation {
                    id: ActionId::WorkspaceOpenProject,
                    ..
                }),
                ..
            }
        ));
    }

    #[test]
    fn expires_pending_sequences_after_timeout() {
        let settings = KeymapSettings {
            keymap_profile: Some("Default".to_string()),
            keymap_bindings: vec![binding(
                ActionId::WorkspaceOpenRecentProject,
                "app",
                "Ctrl+O Ctrl+R",
            )],
            keymap_overrides: Vec::new(),
        };
        let state = ActionResolverState::default();
        let context = snapshot("app", vec![node("app", None, &["app"], &[])]);

        let first = resolve_key_event_with_settings(
            &state,
            &settings,
            LogicalKeyEvent {
                window_id: "main".to_string(),
                key: "o".to_string(),
                modifiers: vec![KeyModifier::Control],
            },
            context.clone(),
        );

        state.pending.lock().insert(
            "main".to_string(),
            PendingSequence {
                sequence: parse_key_sequence("Ctrl+O").unwrap(),
                fallback: None,
                expires_at: Instant::now() - Duration::from_millis(1),
            },
        );

        let second = resolve_key_event_with_settings(
            &state,
            &settings,
            LogicalKeyEvent {
                window_id: "main".to_string(),
                key: "r".to_string(),
                modifiers: vec![KeyModifier::Control],
            },
            context,
        );

        assert!(matches!(first, ActionResolution::PendingSequence { .. }));
        assert!(matches!(second, ActionResolution::NoMatch));
    }

    #[test]
    fn chooses_the_most_specific_matching_context() {
        let settings = KeymapSettings {
            keymap_profile: Some("Default".to_string()),
            keymap_bindings: vec![
                binding(ActionId::WorkspaceSaveProject, "workspace", "Ctrl+S"),
                binding(
                    ActionId::EditorInsertParagraph,
                    "workspace && editor",
                    "Ctrl+S",
                ),
            ],
            keymap_overrides: Vec::new(),
        };
        let state = ActionResolverState::default();
        let resolution = resolve_key_event_with_settings(
            &state,
            &settings,
            LogicalKeyEvent {
                window_id: "main".to_string(),
                key: "s".to_string(),
                modifiers: vec![KeyModifier::Control],
            },
            snapshot(
                "editor",
                vec![
                    node("app", None, &["app"], &[]),
                    node("workspace", Some("app"), &["workspace"], &[]),
                    node("editor", Some("workspace"), &["editor"], &[]),
                ],
            ),
        );

        assert!(matches!(
            resolution,
            ActionResolution::Matched {
                invocation: ActionInvocation {
                    id: ActionId::EditorInsertParagraph,
                    ..
                }
            }
        ));
    }

    #[test]
    fn insert_heading_matches_editor_body_without_input_context() {
        let settings = KeymapSettings {
            keymap_profile: Some("Default".to_string()),
            keymap_bindings: vec![binding(
                ActionId::EditorInsertParagraph,
                "editor",
                "Ctrl+Alt+P",
            )],
            keymap_overrides: Vec::new(),
        };
        let state = ActionResolverState::default();
        let resolution = resolve_key_event_with_settings(
            &state,
            &settings,
            LogicalKeyEvent {
                window_id: "main".to_string(),
                key: "p".to_string(),
                modifiers: vec![KeyModifier::Control, KeyModifier::Alt],
            },
            snapshot(
                "body-section",
                vec![
                    node("app", None, &["app"], &[]),
                    node("workspace", Some("app"), &["workspace"], &[]),
                    node("editor", Some("workspace"), &["editor"], &[]),
                    node(
                        "body-section",
                        Some("editor"),
                        &["body", "editor"],
                        &[],
                    ),
                ],
            ),
        );

        assert!(matches!(
            resolution,
            ActionResolution::Matched {
                invocation: ActionInvocation {
                    id: ActionId::EditorInsertParagraph,
                    ..
                }
            }
        ));
    }

    #[test]
    fn insert_heading_resolves_table_cell_binding_over_body_editor() {
        let settings = KeymapSettings {
            keymap_profile: Some("Default".to_string()),
            keymap_bindings: vec![
                binding(
                    ActionId::EditorInsertHeading,
                    "editor && !tableCell",
                    "Ctrl+Alt+H",
                ),
                binding(ActionId::EditorInsertHeading, "tableCell", "Ctrl+Alt+H"),
            ],
            keymap_overrides: Vec::new(),
        };
        let state = ActionResolverState::default();
        let resolution = resolve_key_event_with_settings(
            &state,
            &settings,
            LogicalKeyEvent {
                window_id: "main".to_string(),
                key: "h".to_string(),
                modifiers: vec![KeyModifier::Control, KeyModifier::Alt],
            },
            snapshot(
                "active-table-cell",
                vec![
                    node("app", None, &["app"], &[]),
                    node("workspace", Some("app"), &["workspace"], &[]),
                    node("editor", Some("workspace"), &["editor"], &[]),
                    node(
                        "body-section",
                        Some("editor"),
                        &["body", "editor"],
                        &[],
                    ),
                    node(
                        "active-table-cell",
                        Some("body-section"),
                        &["tableCell"],
                        &[],
                    ),
                ],
            ),
        );

        assert!(matches!(
            resolution,
            ActionResolution::Matched {
                invocation: ActionInvocation {
                    id: ActionId::EditorInsertHeading,
                    ..
                }
            }
        ));
    }

    #[test]
    fn context_matching_prevents_editor_shortcuts_inside_inputs() {
        let settings = KeymapSettings {
            keymap_profile: Some("Default".to_string()),
            keymap_bindings: vec![binding(
                ActionId::EditorInsertParagraph,
                "editor && !input",
                "Ctrl+Alt+P",
            )],
            keymap_overrides: Vec::new(),
        };
        let state = ActionResolverState::default();
        let resolution = resolve_key_event_with_settings(
            &state,
            &settings,
            LogicalKeyEvent {
                window_id: "main".to_string(),
                key: "p".to_string(),
                modifiers: vec![KeyModifier::Control, KeyModifier::Alt],
            },
            snapshot(
                "input",
                vec![
                    node("app", None, &["app"], &[]),
                    node("workspace", Some("app"), &["workspace"], &[]),
                    node("editor", Some("workspace"), &["editor"], &[]),
                    node("input", Some("editor"), &["input"], &[]),
                ],
            ),
        );

        assert!(matches!(resolution, ActionResolution::NoMatch));
    }

    #[test]
    fn detects_conflicts_with_overlapping_contexts() {
        let settings = KeymapSettings {
            keymap_profile: Some("Default".to_string()),
            keymap_bindings: vec![
                binding(ActionId::WorkspaceSaveProject, "workspace", "Ctrl+S"),
                binding(ActionId::EditUndo, "workspace && !input", "Ctrl+S"),
            ],
            keymap_overrides: Vec::new(),
        };

        let validation = validate_keymap(&settings);

        assert_eq!(validation.conflicts.len(), 1);
    }
}
