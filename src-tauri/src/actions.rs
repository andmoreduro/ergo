use crate::ast::{
    normalize_key_name, ActionId, KeyBindingPreference, KeyModifier, KeyStroke, KeymapSettings,
};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};
use tauri::{AppHandle, State};
use ts_rs::TS;

const KEY_SEQUENCE_TIMEOUT_MS: u32 = 900;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ActionInvocation {
    pub id: ActionId,
    #[serde(default)]
    #[ts(type = "unknown | null")]
    pub payload: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ActionDescriptor {
    pub id: ActionId,
    pub label_key: String,
    pub category: String,
    pub default_context: String,
    pub allows_keybinding: bool,
    pub requires_project: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ActionContextNode {
    pub id: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub contexts: Vec<String>,
    #[serde(default)]
    pub attributes: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ActionContextSnapshot {
    pub window_id: String,
    #[serde(default)]
    pub focused_context_id: Option<String>,
    #[serde(default)]
    pub nodes: Vec<ActionContextNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct LogicalKeyEvent {
    pub window_id: String,
    pub key: String,
    #[serde(default)]
    pub modifiers: Vec<KeyModifier>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ActionResolution {
    NoMatch,
    PendingSequence {
        sequence: Vec<KeyStroke>,
        fallback: Option<ActionInvocation>,
        timeout_ms: u32,
    },
    Matched {
        invocation: ActionInvocation,
    },
    Cancelled,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct KeymapConflict {
    pub action_id: ActionId,
    pub conflicting_action_id: ActionId,
    pub context: String,
    pub sequence: Vec<KeyStroke>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct KeymapValidationResult {
    pub conflicts: Vec<KeymapConflict>,
    pub errors: Vec<String>,
}

#[derive(Default)]
pub struct ActionResolverState {
    pending: Mutex<HashMap<String, PendingSequence>>,
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

#[tauri::command]
pub fn get_action_catalog() -> Vec<ActionDescriptor> {
    action_catalog()
}

#[tauri::command]
pub fn reset_key_sequence(window_id: String, state: State<'_, ActionResolverState>) {
    state.pending.lock().remove(&window_id);
}

#[tauri::command]
pub fn validate_keymap_settings(settings: KeymapSettings) -> KeymapValidationResult {
    validate_keymap(&settings)
}

#[tauri::command]
pub fn resolve_key_event(
    app: AppHandle,
    state: State<'_, ActionResolverState>,
    event: LogicalKeyEvent,
    context_snapshot: ActionContextSnapshot,
) -> Result<ActionResolution, String> {
    let settings = crate::settings::load_keymap_settings(app)?;
    Ok(resolve_key_event_with_settings(
        &state,
        &settings,
        event,
        context_snapshot,
    ))
}

pub fn action_catalog() -> Vec<ActionDescriptor> {
    vec![
        descriptor(
            ActionId::WorkspaceNewProject,
            "action_workspace_new_project",
            "workspace",
            "app",
            true,
            false,
        ),
        descriptor(
            ActionId::WorkspaceOpenProject,
            "action_workspace_open_project",
            "workspace",
            "app",
            true,
            false,
        ),
        descriptor(
            ActionId::WorkspaceOpenRecentProject,
            "action_workspace_open_recent_project",
            "workspace",
            "app",
            true,
            false,
        ),
        descriptor(
            ActionId::WorkspaceSaveProject,
            "action_workspace_save_project",
            "workspace",
            "workspace && !input",
            true,
            true,
        ),
        descriptor(
            ActionId::WorkspaceCloseProject,
            "action_workspace_close_project",
            "workspace",
            "workspace",
            true,
            true,
        ),
        descriptor(
            ActionId::WorkspaceExportSvg,
            "action_workspace_export_svg",
            "workspace",
            "workspace && !input",
            true,
            true,
        ),
        descriptor(
            ActionId::EditUndo,
            "action_edit_undo",
            "edit",
            "workspace && !input",
            true,
            true,
        ),
        descriptor(
            ActionId::EditRedo,
            "action_edit_redo",
            "edit",
            "workspace && !input",
            true,
            true,
        ),
        descriptor(
            ActionId::EditorDeleteElement,
            "action_editor_delete_element",
            "editor",
            "element && !input",
            true,
            true,
        ),
        descriptor(
            ActionId::EditorInsertParagraph,
            "action_editor_insert_paragraph",
            "editor",
            "editor && !input",
            true,
            true,
        ),
        descriptor(
            ActionId::EditorInsertHeading,
            "action_editor_insert_heading",
            "editor",
            "editor && !input",
            true,
            true,
        ),
        descriptor(
            ActionId::EditorInsertTable,
            "action_editor_insert_table",
            "editor",
            "editor && !input",
            true,
            true,
        ),
        descriptor(
            ActionId::EditorInsertFigure,
            "action_editor_insert_figure",
            "editor",
            "editor && !input",
            true,
            true,
        ),
        descriptor(
            ActionId::EditorInsertEquation,
            "action_editor_insert_equation",
            "editor",
            "editor && !input",
            true,
            true,
        ),
        descriptor(
            ActionId::EditorInsertReference,
            "action_editor_insert_reference",
            "editor",
            "editor && !input",
            true,
            true,
        ),
        descriptor(
            ActionId::EditorAddAuthor,
            "action_editor_add_author",
            "editor",
            "coverPage",
            true,
            true,
        ),
        descriptor(
            ActionId::EditorRemoveAuthor,
            "action_editor_remove_author",
            "editor",
            "coverPage",
            true,
            true,
        ),
        descriptor(
            ActionId::EditorAddTableRow,
            "action_editor_add_table_row",
            "editor",
            "element && element.kind == \"Table\"",
            true,
            true,
        ),
        descriptor(
            ActionId::EditorAddTableColumn,
            "action_editor_add_table_column",
            "editor",
            "element && element.kind == \"Table\"",
            true,
            true,
        ),
        descriptor(
            ActionId::EditorRemoveTableRow,
            "action_editor_remove_table_row",
            "editor",
            "element && element.kind == \"Table\"",
            true,
            true,
        ),
        descriptor(
            ActionId::EditorRemoveTableColumn,
            "action_editor_remove_table_column",
            "editor",
            "element && element.kind == \"Table\"",
            true,
            true,
        ),
        descriptor(
            ActionId::ViewOpenCommandPalette,
            "action_view_open_command_palette",
            "view",
            "app",
            true,
            false,
        ),
        descriptor(
            ActionId::ViewZoomIn,
            "action_view_zoom_in",
            "view",
            "preview",
            true,
            true,
        ),
        descriptor(
            ActionId::ViewZoomOut,
            "action_view_zoom_out",
            "view",
            "preview",
            true,
            true,
        ),
        descriptor(
            ActionId::ThemeUseSystem,
            "action_theme_use_system",
            "settings",
            "app",
            true,
            false,
        ),
        descriptor(
            ActionId::ThemeUseLight,
            "action_theme_use_light",
            "settings",
            "app",
            true,
            false,
        ),
        descriptor(
            ActionId::ThemeUseDark,
            "action_theme_use_dark",
            "settings",
            "app",
            true,
            false,
        ),
        descriptor(
            ActionId::SettingsOpenGlobal,
            "action_settings_open_global",
            "settings",
            "app",
            true,
            false,
        ),
        descriptor(
            ActionId::SettingsOpenProject,
            "action_settings_open_project",
            "settings",
            "workspace",
            true,
            true,
        ),
        descriptor(
            ActionId::SettingsOpenKeymap,
            "action_settings_open_keymap",
            "settings",
            "app",
            true,
            false,
        ),
        descriptor(
            ActionId::SettingsClose,
            "action_settings_close",
            "settings",
            "dialog",
            false,
            false,
        ),
        descriptor(
            ActionId::HelpOpenDocumentation,
            "action_help_open_documentation",
            "help",
            "app",
            true,
            false,
        ),
        descriptor(
            ActionId::HelpOpenAbout,
            "action_help_open_about",
            "help",
            "app",
            true,
            false,
        ),
    ]
}

fn descriptor(
    id: ActionId,
    label_key: &str,
    category: &str,
    default_context: &str,
    allows_keybinding: bool,
    requires_project: bool,
) -> ActionDescriptor {
    ActionDescriptor {
        id,
        label_key: label_key.to_string(),
        category: category.to_string(),
        default_context: default_context.to_string(),
        allows_keybinding,
        requires_project,
    }
}

fn resolve_key_event_with_settings(
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

fn effective_bindings(settings: &KeymapSettings) -> Vec<KeyBindingPreference> {
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

fn validate_keymap(settings: &KeymapSettings) -> KeymapValidationResult {
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

fn contexts_may_overlap(left: &str, right: &str) -> bool {
    if left == right {
        return true;
    }

    let left_positive = positive_context_names(left);
    let right_positive = positive_context_names(right);

    if left_positive.is_empty() || right_positive.is_empty() {
        return true;
    }

    !left_positive.is_disjoint(&right_positive)
}

fn positive_context_names(expression: &str) -> HashSet<String> {
    let mut names = HashSet::new();
    let mut negate_next = false;
    let mut previous = "";

    for token in tokenize_context_expression(expression).unwrap_or_default() {
        match token {
            Token::Bang => negate_next = true,
            Token::Identifier(value) => {
                if previous != "==" && !negate_next {
                    names.insert(value);
                }
                negate_next = false;
                previous = "id";
            }
            Token::Equals => previous = "==",
            _ => {
                negate_next = false;
                previous = "";
            }
        }
    }

    names
}

#[derive(Debug, Clone)]
struct ActiveContext {
    names: HashSet<String>,
    attributes: HashMap<String, String>,
}

impl ActiveContext {
    fn from_snapshot(snapshot: &ActionContextSnapshot) -> Self {
        let nodes_by_id: HashMap<_, _> = snapshot
            .nodes
            .iter()
            .map(|node| (node.id.as_str(), node))
            .collect();
        let mut chain = Vec::new();
        let mut current = snapshot
            .focused_context_id
            .as_deref()
            .or_else(|| snapshot.nodes.first().map(|node| node.id.as_str()));

        while let Some(id) = current {
            if let Some(node) = nodes_by_id.get(id) {
                chain.push(*node);
                current = node.parent_id.as_deref();
            } else {
                break;
            }
        }

        chain.reverse();

        let mut names = HashSet::new();
        let mut attributes = HashMap::new();

        for node in chain {
            for name in &node.contexts {
                names.insert(name.clone());
            }
            for (key, value) in &node.attributes {
                attributes.insert(key.clone(), value.clone());
            }
        }

        Self { names, attributes }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ContextExpression {
    Context(String),
    Equals(String, String),
    Not(Box<ContextExpression>),
    And(Box<ContextExpression>, Box<ContextExpression>),
    Or(Box<ContextExpression>, Box<ContextExpression>),
}

impl ContextExpression {
    fn evaluate(&self, context: &ActiveContext) -> bool {
        match self {
            ContextExpression::Context(name) => context.names.contains(name),
            ContextExpression::Equals(key, value) => context
                .attributes
                .get(key)
                .map(|actual| actual == value)
                .unwrap_or(false),
            ContextExpression::Not(inner) => !inner.evaluate(context),
            ContextExpression::And(left, right) => {
                left.evaluate(context) && right.evaluate(context)
            }
            ContextExpression::Or(left, right) => left.evaluate(context) || right.evaluate(context),
        }
    }

    fn specificity(&self) -> usize {
        match self {
            ContextExpression::Context(_) => 1,
            ContextExpression::Equals(_, _) => 2,
            ContextExpression::Not(inner) => inner.specificity(),
            ContextExpression::And(left, right) | ContextExpression::Or(left, right) => {
                left.specificity() + right.specificity()
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    Identifier(String),
    String(String),
    And,
    Or,
    Bang,
    Equals,
    LeftParen,
    RightParen,
}

fn parse_context_expression(value: &str) -> Result<ContextExpression, String> {
    let tokens = tokenize_context_expression(value)?;
    let mut parser = ContextParser {
        tokens,
        position: 0,
    };
    let expression = parser.parse_or()?;

    if parser.position != parser.tokens.len() {
        return Err("unexpected trailing tokens".to_string());
    }

    Ok(expression)
}

fn tokenize_context_expression(value: &str) -> Result<Vec<Token>, String> {
    let chars: Vec<char> = value.chars().collect();
    let mut index = 0;
    let mut tokens = Vec::new();

    while index < chars.len() {
        match chars[index] {
            character if character.is_whitespace() => index += 1,
            '&' if chars.get(index + 1) == Some(&'&') => {
                tokens.push(Token::And);
                index += 2;
            }
            '|' if chars.get(index + 1) == Some(&'|') => {
                tokens.push(Token::Or);
                index += 2;
            }
            '=' if chars.get(index + 1) == Some(&'=') => {
                tokens.push(Token::Equals);
                index += 2;
            }
            '!' => {
                tokens.push(Token::Bang);
                index += 1;
            }
            '(' => {
                tokens.push(Token::LeftParen);
                index += 1;
            }
            ')' => {
                tokens.push(Token::RightParen);
                index += 1;
            }
            '"' => {
                index += 1;
                let start = index;
                while index < chars.len() && chars[index] != '"' {
                    index += 1;
                }
                if index >= chars.len() {
                    return Err("unterminated string literal".to_string());
                }
                tokens.push(Token::String(chars[start..index].iter().collect()));
                index += 1;
            }
            character if is_identifier_start(character) => {
                let start = index;
                index += 1;
                while index < chars.len() && is_identifier_part(chars[index]) {
                    index += 1;
                }
                tokens.push(Token::Identifier(chars[start..index].iter().collect()));
            }
            character => {
                return Err(format!(
                    "unexpected context expression character: {character}"
                ))
            }
        }
    }

    if tokens.is_empty() {
        return Err("context expression cannot be empty".to_string());
    }

    Ok(tokens)
}

fn is_identifier_start(value: char) -> bool {
    value.is_alphabetic() || value == '_'
}

fn is_identifier_part(value: char) -> bool {
    value.is_alphanumeric() || matches!(value, '_' | '-' | '.' | ':')
}

struct ContextParser {
    tokens: Vec<Token>,
    position: usize,
}

impl ContextParser {
    fn parse_or(&mut self) -> Result<ContextExpression, String> {
        let mut expression = self.parse_and()?;

        while self.matches(&Token::Or) {
            let right = self.parse_and()?;
            expression = ContextExpression::Or(Box::new(expression), Box::new(right));
        }

        Ok(expression)
    }

    fn parse_and(&mut self) -> Result<ContextExpression, String> {
        let mut expression = self.parse_not()?;

        while self.matches(&Token::And) {
            let right = self.parse_not()?;
            expression = ContextExpression::And(Box::new(expression), Box::new(right));
        }

        Ok(expression)
    }

    fn parse_not(&mut self) -> Result<ContextExpression, String> {
        if self.matches(&Token::Bang) {
            return Ok(ContextExpression::Not(Box::new(self.parse_not()?)));
        }

        self.parse_primary()
    }

    fn parse_primary(&mut self) -> Result<ContextExpression, String> {
        if self.matches(&Token::LeftParen) {
            let expression = self.parse_or()?;
            if !self.matches(&Token::RightParen) {
                return Err("expected ')'".to_string());
            }
            return Ok(expression);
        }

        match self.advance() {
            Some(Token::Identifier(identifier)) => {
                if self.matches(&Token::Equals) {
                    let value = match self.advance() {
                        Some(Token::String(value)) | Some(Token::Identifier(value)) => value,
                        _ => return Err("expected value after '=='".to_string()),
                    };
                    Ok(ContextExpression::Equals(identifier, value))
                } else {
                    Ok(ContextExpression::Context(identifier))
                }
            }
            _ => Err("expected context name".to_string()),
        }
    }

    fn matches(&mut self, token: &Token) -> bool {
        if self.tokens.get(self.position) == Some(token) {
            self.position += 1;
            return true;
        }

        false
    }

    fn advance(&mut self) -> Option<Token> {
        let token = self.tokens.get(self.position).cloned();
        if token.is_some() {
            self.position += 1;
        }
        token
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::parse_key_sequence;

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
