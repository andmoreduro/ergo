use crate::action_context::{parse_context_expression, ActiveContext};
use crate::action_keymap::effective_bindings;
use crate::ast::{
    normalize_key_name, KeyBindingPreference, KeyModifier, KeyStroke, KeymapSettings,
};

#[cfg(test)]
use crate::ast::ActionId;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::time::{Duration, Instant};

const KEY_SEQUENCE_TIMEOUT_MS: u32 = 900;

pub use crate::action_catalog::action_catalog;
pub use crate::context_glossary::context_glossary;
pub use crate::action_keymap::validate_keymap;
pub use crate::action_types::{
    ActionAvailability, ActionContextNode, ActionContextSnapshot, ActionDescriptor,
    ActionInvocation, ActionResolution, ContextDescriptor, KeymapConflict,
    KeymapValidationResult, LogicalKeyEvent,
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
                    fallback: Some(invocation_from_binding(&exact.binding)),
                    expires_at: now + Duration::from_millis(u64::from(KEY_SEQUENCE_TIMEOUT_MS)),
                },
            );

            ActionResolution::PendingSequence {
                sequence,
                fallback: Some(invocation_from_binding(&exact.binding)),
                timeout_ms: KEY_SEQUENCE_TIMEOUT_MS,
            }
        }
        (Some(exact), false) => ActionResolution::Matched {
            invocation: invocation_from_binding(&exact.binding),
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

/// For every catalog action: does its default context hold in `context_snapshot`,
/// and which effective binding (most specific matching context) would fire it
/// there. Actions that never take a keybinding still report availability.
pub fn action_availability_with_settings(
    settings: &KeymapSettings,
    context_snapshot: &ActionContextSnapshot,
) -> Vec<ActionAvailability> {
    let active_context = ActiveContext::from_snapshot(context_snapshot);
    let bindings = effective_bindings(settings);

    action_catalog()
        .into_iter()
        .map(|descriptor| {
            let available = parse_context_expression(&descriptor.default_context)
                .map(|expression| expression.evaluate(&active_context))
                .unwrap_or(false);
            let shortcut = bindings
                .iter()
                .filter(|binding| binding.action_id == descriptor.id && !binding.sequence.is_empty())
                .filter_map(|binding| {
                    let expression = parse_context_expression(&binding.context).ok()?;
                    expression
                        .evaluate(&active_context)
                        .then(|| (expression.specificity(), binding.sequence.clone()))
                })
                .max_by_key(|(specificity, _)| *specificity)
                .map(|(_, sequence)| sequence);
            ActionAvailability {
                id: descriptor.id,
                available,
                shortcut,
            }
        })
        .collect()
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

fn invocation_from_binding(binding: &KeyBindingPreference) -> ActionInvocation {
    ActionInvocation {
        id: binding.action_id,
        payload: binding.payload.clone(),
    }
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
            payload: None,
        }
    }

    fn binding_with_payload(
        action_id: ActionId,
        context: &str,
        sequence: &str,
        payload: serde_json::Value,
    ) -> KeyBindingPreference {
        KeyBindingPreference {
            action_id,
            context: context.to_string(),
            sequence: parse_key_sequence(sequence).unwrap(),
            payload: Some(payload),
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
    fn resolves_heading_insert_with_level_payload() {
        let settings = KeymapSettings {
            keymap_profile: Some("Default".to_string()),
            keymap_bindings: vec![binding_with_payload(
                ActionId::EditorInsertHeading,
                "editor && !tableCell",
                "Ctrl+Alt+Shift+3",
                serde_json::json!({ "level": 3 }),
            )],
            keymap_overrides: Vec::new(),
            ..Default::default()
        };
        let state = ActionResolverState::default();

        let resolution = resolve_key_event_with_settings(
            &state,
            &settings,
            LogicalKeyEvent {
                window_id: "main".to_string(),
                key: "3".to_string(),
                modifiers: vec![KeyModifier::Control, KeyModifier::Alt, KeyModifier::Shift],
            },
            snapshot("editor", vec![node("editor", None, &["editor", "body"], &[])]),
        );

        assert!(matches!(
            resolution,
            ActionResolution::Matched {
                invocation: ActionInvocation {
                    id: ActionId::EditorInsertHeading,
                    payload: Some(payload),
                }
            } if payload.get("level") == Some(&serde_json::json!(3))
        ));
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
            ..Default::default()
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
            ..Default::default()
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
            ..Default::default()
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
            ..Default::default()
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
            ..Default::default()
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
            ..Default::default()
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
                binding_with_payload(
                    ActionId::EditorInsertHeading,
                    "editor && !tableCell",
                    "Ctrl+Alt+Shift+2",
                    serde_json::json!({ "level": 2 }),
                ),
                binding(ActionId::EditorInsertHeading, "tableCell", "Ctrl+Alt+Shift+2"),
            ],
            keymap_overrides: Vec::new(),
            ..Default::default()
        };
        let state = ActionResolverState::default();
        let resolution = resolve_key_event_with_settings(
            &state,
            &settings,
            LogicalKeyEvent {
                window_id: "main".to_string(),
                key: "2".to_string(),
                modifiers: vec![
                    KeyModifier::Control,
                    KeyModifier::Alt,
                    KeyModifier::Shift,
                ],
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
            ..Default::default()
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
            ..Default::default()
        };

        let validation = validate_keymap(&settings);

        assert_eq!(validation.conflicts.len(), 1);
    }

    fn bundled_keymap() -> KeymapSettings {
        serde_json::from_str(include_str!("../defaults/default_keymap.json"))
            .expect("default keymap parses")
    }

    fn workspace_editor_snapshot() -> ActionContextSnapshot {
        snapshot(
            "body",
            vec![
                node("app", None, &["app"], &[]),
                node("workspace", Some("app"), &["workspace"], &[]),
                node("editor", Some("workspace"), &["editor"], &[]),
                node("body", Some("editor"), &["body", "editor"], &[]),
            ],
        )
    }

    /// Regression: the bundled keymap has several bindings per action and
    /// context (heading levels, zoom alternatives). Every one must resolve.
    #[test]
    fn bundled_alternatives_all_resolve() {
        let state = ActionResolverState::default();
        let settings = bundled_keymap();

        for level in 1..=6u32 {
            let event = LogicalKeyEvent {
                window_id: "main".to_string(),
                key: level.to_string(),
                modifiers: vec![KeyModifier::Control, KeyModifier::Alt, KeyModifier::Shift],
            };
            match resolve_key_event_with_settings(&state, &settings, event, workspace_editor_snapshot()) {
                ActionResolution::Matched { invocation } => {
                    assert_eq!(invocation.id, ActionId::EditorInsertHeading);
                    assert_eq!(invocation.payload, Some(serde_json::json!({ "level": level })));
                }
                other => panic!("Ctrl+Alt+Shift+{level} did not match: {other:?}"),
            }
        }

        for key in ["=", "+"] {
            let event = LogicalKeyEvent {
                window_id: "main".to_string(),
                key: key.to_string(),
                modifiers: vec![KeyModifier::Control],
            };
            match resolve_key_event_with_settings(&state, &settings, event, workspace_editor_snapshot()) {
                ActionResolution::Matched { invocation } => assert_eq!(invocation.id, ActionId::ViewZoomIn),
                other => panic!("Ctrl+{key} did not match: {other:?}"),
            }
        }
    }

    #[test]
    fn availability_reports_context_and_matching_shortcut() {
        let settings = bundled_keymap();
        let availability = action_availability_with_settings(&settings, &workspace_editor_snapshot());
        let by_id: std::collections::HashMap<_, _> =
            availability.into_iter().map(|entry| (entry.id, entry)).collect();

        let zoom = &by_id[&ActionId::ViewZoomIn];
        assert!(zoom.available, "zoom applies anywhere in the workspace");
        assert!(zoom.shortcut.is_some(), "zoom has a bundled shortcut");

        let new_project = &by_id[&ActionId::WorkspaceNewProject];
        assert!(new_project.available);

        let add_row = &by_id[&ActionId::EditorAddTableRow];
        assert!(!add_row.available, "table actions need a table context");

        let welcome_only = action_availability_with_settings(
            &settings,
            &snapshot("welcome", vec![node("app", None, &["app"], &[]), node("welcome", Some("app"), &["welcome"], &[])]),
        );
        let save = welcome_only.iter().find(|entry| entry.id == ActionId::WorkspaceSaveProject).unwrap();
        assert!(!save.available, "save needs a workspace");
    }
}
