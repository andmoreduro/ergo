use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::compilation_types::SourceRevision;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PreviewPageMetrics {
    pub page_number: usize,
    pub width_pt: f64,
    pub height_pt: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PreviewCaretCue {
    pub top_y_pt: f64,
    pub height_pt: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PreviewElementPosition {
    pub element_id: Option<String>,
    #[serde(default)]
    pub field_id: Option<String>,
    #[serde(default)]
    pub caret_utf16_offset: Option<usize>,
    pub page_number: usize,
    pub x_pt: f64,
    pub y_pt: f64,
    #[serde(default)]
    pub caret_cue: Option<PreviewCaretCue>,
    #[ts(type = "number")]
    pub source_revision: SourceRevision,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PreviewFocusTarget {
    pub element_id: String,
    #[serde(default)]
    pub field_id: Option<String>,
    #[serde(default)]
    pub caret_utf16_offset: Option<usize>,
    // Preview page to prefer when the field maps to multiple rendered spots.
    #[serde(default)]
    pub anchor_page_number: Option<usize>,
    #[ts(type = "number")]
    pub source_revision: SourceRevision,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PreviewSyncStatus {
    #[ts(type = "number | null")]
    pub source_revision: Option<SourceRevision>,
    pub pages: Vec<PreviewPageMetrics>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PreviewJumpResult {
    Field {
        target: PreviewFocusTarget,
        #[ts(type = "number")]
        source_revision: SourceRevision,
    },
    Element {
        element_id: String,
        #[ts(type = "number")]
        source_revision: SourceRevision,
    },
    Position {
        position: PreviewElementPosition,
        #[ts(type = "number")]
        source_revision: SourceRevision,
    },
    NoMatch {
        #[ts(type = "number | null")]
        source_revision: Option<SourceRevision>,
        reason: String,
    },
    Unavailable {
        #[ts(type = "number | null")]
        source_revision: Option<SourceRevision>,
        reason: String,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PreviewElementPositionsResult {
    Matched {
        positions: Vec<PreviewElementPosition>,
        #[ts(type = "number")]
        source_revision: SourceRevision,
    },
    NoMatch {
        #[ts(type = "number | null")]
        source_revision: Option<SourceRevision>,
        reason: String,
    },
    Unavailable {
        #[ts(type = "number | null")]
        source_revision: Option<SourceRevision>,
        reason: String,
    },
}
