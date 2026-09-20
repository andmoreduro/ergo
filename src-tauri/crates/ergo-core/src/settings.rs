//! Configuration types shared by the app shell, the document model and the
//! frontend (via ts-rs).
//!
//! Three kinds of configuration exist:
//!
//! - [`GlobalSettings`]: per-user application preferences, persisted by the app
//!   shell in `settings.json`. The bundled `defaults/default_settings.json` is
//!   the single source of truth for their defaults; it is embedded at compile
//!   time so `GlobalSettings::default()` can never drift from the shipped file.
//! - [`KeymapSettings`]: per-user keymap profiles, persisted in `keymap.json` on
//!   top of the bundled `defaults/default_keymap.json` bindings.
//! - [`ProjectSettings`]: per-project document settings stored inside the
//!   project archive (`.ergproj/project_settings.json`, mirrored in the AST).

use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ast::{ActionId, EquationSyntax, KeyStroke};

/// Shipped defaults, embedded verbatim from `src-tauri/defaults/default_settings.json`.
pub const DEFAULT_GLOBAL_SETTINGS_JSON: &str =
    include_str!("../../../defaults/default_settings.json");

/// Persisted widths of the resizable workspace columns (sidebar and editor); the
/// preview takes the remaining width.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct WorkspaceColumnWidths {
    pub sidebar: f32,
    pub editor: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct GlobalSettings {
    pub default_font: Option<String>,
    pub default_font_size: Option<f32>,
    #[serde(default)]
    pub theme_mode: Option<String>,
    #[serde(default)]
    pub locale: Option<String>,
    #[serde(default)]
    pub recent_projects: Vec<String>,
    #[serde(default)]
    pub history_limit: Option<usize>,
    #[serde(default)]
    pub autosave_enabled: Option<bool>,
    #[serde(default)]
    pub autosave_interval_ms: Option<usize>,
    #[serde(default)]
    pub autosave_on_window_blur: Option<bool>,
    #[serde(default)]
    pub autosave_on_app_close: Option<bool>,
    #[serde(default)]
    pub autosave_on_project_close: Option<bool>,
    /// Syntax applied to newly inserted equations.
    #[serde(default)]
    pub default_equation_syntax: Option<EquationSyntax>,
    /// Runs the Zotero translation server in a fixed-name Docker container on localhost.
    #[serde(default)]
    pub zotero_translation_server_enabled: Option<bool>,
    /// Base URL of a translation server the user runs themselves. When set, lookups
    /// target it and Érgo manages no Docker container.
    #[serde(default)]
    pub zotero_translation_server_url: Option<String>,
    /// Scale factor applied to preview page rasterization while the user is typing.
    /// Full resolution (1.0) is used after an idle window.
    #[serde(default)]
    pub preview_draft_render_factor: Option<f32>,
    /// Fraction of the viewport rasterized beyond the visible edges of each preview
    /// page (advanced). `0.0` rasterizes exactly what is on screen; a positive value
    /// pre-renders a margin so scrolling reveals content with less delay.
    #[serde(default)]
    pub preview_render_overscan_factor: Option<f32>,
    /// Milliseconds to wait before re-rasterizing preview canvases after zoom,
    /// scroll sharpening, or sidebar resize. A short debounce keeps gestures
    /// smooth; zero re-rasterizes on every notification.
    #[serde(default)]
    pub preview_rasterization_debounce_ms: Option<usize>,
    /// Milliseconds to wait before re-rasterizing when scrolling or zooming out
    /// reveals area the current bitmap no longer covers. Zero repaints
    /// immediately; a positive value reduces work during fast scroll.
    #[serde(default)]
    pub preview_reveal_debounce_ms: Option<usize>,
    /// Milliseconds to wait before resolving the editor caret's position in the
    /// preview (forward sync). Zero resolves on every caret move; a positive
    /// value coalesces bursts while typing.
    #[serde(default)]
    pub preview_forward_sync_debounce_ms: Option<usize>,
    /// Milliseconds a draft (reduced-resolution) preview render waits while idle
    /// before being promoted to full resolution. Only applies when the draft
    /// render factor is below 1.
    #[serde(default)]
    pub preview_draft_promote_ms: Option<usize>,
    /// Draw a forward-sync caret cue at every visible place the focused source
    /// renders (advanced), not just the one nearest the viewport — useful for
    /// content repeated across pages such as a title in the running head.
    #[serde(default)]
    pub preview_multi_caret: Option<bool>,
    /// Last workspace column layout; `None` until the user resizes a column.
    #[serde(default)]
    pub workspace_columns: Option<WorkspaceColumnWidths>,
}

fn shipped_global_settings() -> &'static GlobalSettings {
    static DEFAULTS: OnceLock<GlobalSettings> = OnceLock::new();
    DEFAULTS.get_or_init(|| {
        serde_json::from_str(DEFAULT_GLOBAL_SETTINGS_JSON)
            .expect("defaults/default_settings.json must deserialize into GlobalSettings")
    })
}

impl Default for GlobalSettings {
    fn default() -> Self {
        shipped_global_settings().clone()
    }
}

impl GlobalSettings {
    /// Fills every unset preference from the shipped defaults, so callers can rely
    /// on a value being present for settings that have one. Preferences that are
    /// meaningfully absent (no default font, no custom server URL, no saved
    /// workspace layout) stay `None`.
    pub fn with_defaults(self) -> Self {
        let defaults = shipped_global_settings();
        Self {
            default_font: self.default_font.or_else(|| defaults.default_font.clone()),
            default_font_size: self.default_font_size.or(defaults.default_font_size),
            theme_mode: self.theme_mode.or_else(|| defaults.theme_mode.clone()),
            locale: self.locale.or_else(|| defaults.locale.clone()),
            recent_projects: self.recent_projects,
            history_limit: self.history_limit.or(defaults.history_limit),
            autosave_enabled: self.autosave_enabled.or(defaults.autosave_enabled),
            autosave_interval_ms: self.autosave_interval_ms.or(defaults.autosave_interval_ms),
            autosave_on_window_blur: self
                .autosave_on_window_blur
                .or(defaults.autosave_on_window_blur),
            autosave_on_app_close: self.autosave_on_app_close.or(defaults.autosave_on_app_close),
            autosave_on_project_close: self
                .autosave_on_project_close
                .or(defaults.autosave_on_project_close),
            default_equation_syntax: self
                .default_equation_syntax
                .or(defaults.default_equation_syntax),
            zotero_translation_server_enabled: self
                .zotero_translation_server_enabled
                .or(defaults.zotero_translation_server_enabled),
            zotero_translation_server_url: self
                .zotero_translation_server_url
                .or_else(|| defaults.zotero_translation_server_url.clone()),
            preview_draft_render_factor: self
                .preview_draft_render_factor
                .or(defaults.preview_draft_render_factor),
            preview_render_overscan_factor: self
                .preview_render_overscan_factor
                .or(defaults.preview_render_overscan_factor),
            preview_rasterization_debounce_ms: self
                .preview_rasterization_debounce_ms
                .or(defaults.preview_rasterization_debounce_ms),
            preview_reveal_debounce_ms: self
                .preview_reveal_debounce_ms
                .or(defaults.preview_reveal_debounce_ms),
            preview_forward_sync_debounce_ms: self
                .preview_forward_sync_debounce_ms
                .or(defaults.preview_forward_sync_debounce_ms),
            preview_draft_promote_ms: self
                .preview_draft_promote_ms
                .or(defaults.preview_draft_promote_ms),
            preview_multi_caret: self.preview_multi_caret.or(defaults.preview_multi_caret),
            workspace_columns: self.workspace_columns.or(defaults.workspace_columns),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ProjectSettings {
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
    #[serde(default)]
    pub template_overrides: Vec<TemplateOverride>,
}

impl Default for ProjectSettings {
    fn default() -> Self {
        Self {
            paper_size: Some("us-letter".to_string()),
            language: Some("en".to_string()),
            text_font: Some("Libertinus Serif".to_string()),
            math_font: Some("Libertinus Math".to_string()),
            raw_font: Some("DejaVu Sans Mono".to_string()),
            font_size: Some(11.0),
            table_stroke_width: Some(0.5),
            template_overrides: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TemplateOverride {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct KeyBindingPreference {
    pub action_id: ActionId,
    pub context: String,
    pub sequence: Vec<KeyStroke>,
    #[serde(default)]
    #[ts(type = "unknown | null")]
    pub payload: Option<serde_json::Value>,
}

pub const DEFAULT_KEYMAP_PROFILE_ID: &str = "default";
pub const CUSTOM_KEYMAP_PROFILE_ID: &str = "custom";

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct KeymapProfileRecord {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub overrides: Vec<KeyBindingPreference>,
}

fn default_active_profile_id() -> String {
    DEFAULT_KEYMAP_PROFILE_ID.to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct KeymapSettings {
    #[serde(default)]
    pub keymap_profile: Option<String>,
    #[serde(default)]
    pub keymap_bindings: Vec<KeyBindingPreference>,
    #[serde(default)]
    pub keymap_overrides: Vec<KeyBindingPreference>,
    #[serde(default = "default_active_profile_id")]
    pub active_profile_id: String,
    #[serde(default)]
    pub profiles: Vec<KeymapProfileRecord>,
}

impl Default for KeymapSettings {
    fn default() -> Self {
        Self {
            keymap_profile: Some("Default".to_string()),
            keymap_bindings: Vec::new(),
            keymap_overrides: Vec::new(),
            active_profile_id: DEFAULT_KEYMAP_PROFILE_ID.to_string(),
            profiles: Vec::new(),
        }
    }
}

/// Canonical keymap shape: a non-empty profile list with a valid active id, the
/// legacy flat `keymap_overrides` migrated into a `custom` profile, and the flat
/// fields mirrored from the active profile for consumers that still read them.
pub fn normalize_keymap_settings(mut settings: KeymapSettings) -> KeymapSettings {
    if settings.profiles.is_empty() {
        let legacy_overrides = settings.keymap_overrides.clone();
        let legacy_name = settings.keymap_profile.clone();

        settings.profiles = vec![KeymapProfileRecord {
            id: DEFAULT_KEYMAP_PROFILE_ID.to_string(),
            name: "Default".to_string(),
            overrides: vec![],
        }];

        if !legacy_overrides.is_empty() {
            settings.profiles.push(KeymapProfileRecord {
                id: CUSTOM_KEYMAP_PROFILE_ID.to_string(),
                name: legacy_name
                    .filter(|name| name != "Default")
                    .unwrap_or_else(|| "Custom".to_string()),
                overrides: legacy_overrides,
            });
            settings.active_profile_id = CUSTOM_KEYMAP_PROFILE_ID.to_string();
        } else {
            settings.active_profile_id = DEFAULT_KEYMAP_PROFILE_ID.to_string();
        }
    }

    if !settings
        .profiles
        .iter()
        .any(|profile| profile.id == settings.active_profile_id)
    {
        settings.active_profile_id = DEFAULT_KEYMAP_PROFILE_ID.to_string();
    }

    if let Some(profile) = settings
        .profiles
        .iter()
        .find(|profile| profile.id == settings.active_profile_id)
    {
        settings.keymap_profile = Some(profile.name.clone());
        settings.keymap_overrides = profile.overrides.clone();
    }

    settings
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Preferences that are meaningfully absent by default; every other setting
    /// must have a value in the shipped defaults file.
    const NULLABLE_BY_DESIGN: &[&str] = &[
        "default_font",
        "default_font_size",
        "zotero_translation_server_url",
        "workspace_columns",
    ];

    #[test]
    fn shipped_defaults_cover_every_setting() {
        let value = serde_json::to_value(GlobalSettings::default()).unwrap();
        let object = value.as_object().unwrap();
        let missing: Vec<&str> = object
            .iter()
            .filter(|(key, value)| value.is_null() && !NULLABLE_BY_DESIGN.contains(&key.as_str()))
            .map(|(key, _)| key.as_str())
            .collect();
        assert!(missing.is_empty(), "defaults missing for {missing:?}");
    }

    #[test]
    fn with_defaults_fills_only_unset_preferences() {
        let partial = GlobalSettings {
            theme_mode: Some("dark".to_string()),
            history_limit: Some(7),
            ..serde_json::from_str("{}").unwrap()
        };

        let filled = partial.with_defaults();

        assert_eq!(filled.theme_mode.as_deref(), Some("dark"));
        assert_eq!(filled.history_limit, Some(7));
        assert_eq!(filled.locale, GlobalSettings::default().locale);
        assert_eq!(filled.autosave_enabled, Some(true));
        assert_eq!(filled.default_font, None);
        assert_eq!(filled.workspace_columns, None);
    }

    #[test]
    fn normalize_migrates_legacy_overrides_into_a_custom_profile() {
        let settings = normalize_keymap_settings(KeymapSettings {
            keymap_profile: Some("Mine".to_string()),
            keymap_overrides: vec![KeyBindingPreference {
                action_id: ActionId::WorkspaceNewProject,
                context: "app".to_string(),
                sequence: vec![],
                payload: None,
            }],
            ..KeymapSettings::default()
        });

        assert_eq!(settings.active_profile_id, CUSTOM_KEYMAP_PROFILE_ID);
        assert_eq!(settings.profiles.len(), 2);
        assert_eq!(settings.profiles[1].name, "Mine");
        assert_eq!(settings.keymap_overrides.len(), 1);
    }
}
