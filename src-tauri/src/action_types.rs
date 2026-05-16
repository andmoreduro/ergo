use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use ts_rs::TS;

use crate::ast::{ActionId, KeyModifier, KeyStroke};

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
