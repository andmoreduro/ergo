use std::fs;
use std::path::{Path, PathBuf};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use ts_rs::TS;

use ergo_core::core_errors::ErgoError;

use ergo_core::settings::{normalize_keymap_settings, GlobalSettings, KeymapSettings};
use crate::template_spec::{load_bundled_template, resolve_template_variant, TemplateSpec};
use crate::translation_server::{self, TranslationServerConfig, TranslationServerStatus};

/// Serializes global settings saves so concurrent async commands cannot interleave
/// the file write with the container sync.
static GLOBAL_SETTINGS_SAVE_LOCK: Mutex<()> = Mutex::new(());

/// Result of `save_global_settings`. The settings file is always written; a failure
/// to reconcile the Zotero translation-server container is reported here instead of
/// failing the save, so the user's preference stands and the UI can surface it.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GlobalSettingsSaveReport {
    pub translation_server_error: Option<String>,
}

const GLOBAL_SETTINGS_FILE_NAME: &str = "settings.json";
const KEYMAP_SETTINGS_FILE_NAME: &str = "keymap.json";
/// Bundled keymap bindings. Global-settings defaults are embedded in
/// `ergo_core::settings` instead of read from the resource directory.
const DEFAULT_KEYMAP_SETTINGS_RESOURCE: &str = "defaults/default_keymap.json";
/// Keys older versions wrote into `settings.json` before the keymap moved to its
/// own file; dropped on read so the strict schema still accepts those files.
const LEGACY_GLOBAL_SETTINGS_KEYS: &[&str] = &["keymap_profile", "keymap_overrides"];
const APP_CONFIG_DIR_NAME: &str = "Ergo";

fn app_config_file_path_from_config_dir(config_dir: &Path, file_name: &str) -> PathBuf {
    config_dir.join(APP_CONFIG_DIR_NAME).join(file_name)
}

fn app_config_file_path(app: &AppHandle, file_name: &str) -> Result<PathBuf, ErgoError> {
    app.path()
        .config_dir()
        .map(|directory| app_config_file_path_from_config_dir(&directory, file_name))
        .map_err(|error| ErgoError::Operation { message: error.to_string() })
}

fn resource_file_path(app: &AppHandle, file_name: &str) -> Option<PathBuf> {
    app.path()
        .resource_dir()
        .ok()
        .map(|directory| directory.join(file_name))
}

fn global_settings_path(app: &AppHandle) -> Result<PathBuf, ErgoError> {
    app_config_file_path(app, GLOBAL_SETTINGS_FILE_NAME)
}

fn keymap_settings_path(app: &AppHandle) -> Result<PathBuf, ErgoError> {
    app_config_file_path(app, KEYMAP_SETTINGS_FILE_NAME)
}

fn default_keymap_settings_path(app: &AppHandle) -> Option<PathBuf> {
    resource_file_path(app, DEFAULT_KEYMAP_SETTINGS_RESOURCE)
}

fn read_global_settings_from_path(path: &Path) -> Result<GlobalSettings, ErgoError> {
    let contents =
        fs::read_to_string(path).map_err(|error| ErgoError::Operation { message: error.to_string() })?;
    let mut value: serde_json::Value = serde_json::from_str(&contents)
        .map_err(|error| ErgoError::Operation { message: error.to_string() })?;
    if let Some(object) = value.as_object_mut() {
        for key in LEGACY_GLOBAL_SETTINGS_KEYS {
            object.remove(*key);
        }
    }
    let settings: GlobalSettings = serde_json::from_value(value)
        .map_err(|error| ErgoError::Operation { message: error.to_string() })?;
    Ok(settings.with_defaults())
}

/// The user's settings file filled with the shipped defaults, or the defaults
/// alone when no file exists yet.
fn load_global_settings_from_path(path: &Path) -> Result<GlobalSettings, ErgoError> {
    if path.exists() {
        return read_global_settings_from_path(path);
    }

    Ok(GlobalSettings::default())
}

fn save_global_settings_to_path(path: &Path, settings: &GlobalSettings) -> Result<(), ErgoError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| ErgoError::Operation { message: error.to_string() })?;
    }

    let contents = serde_json::to_string_pretty(settings)
        .map_err(|error| ErgoError::Operation { message: error.to_string() })?;
    fs::write(path, contents).map_err(|error| ErgoError::Operation { message: error.to_string() })
}

fn read_keymap_settings_from_path(path: &Path) -> Result<KeymapSettings, ErgoError> {
    let contents =
        fs::read_to_string(path).map_err(|error| ErgoError::Operation { message: error.to_string() })?;
    serde_json::from_str(&contents)
        .map_err(|error| ErgoError::Operation { message: error.to_string() })
}

/// The bundled keymap compiled into the binary, so a bare executable (no
/// resource directory next to it) still ships every default shortcut.
const EMBEDDED_DEFAULT_KEYMAP: &str = include_str!("../defaults/default_keymap.json");

fn embedded_default_keymap_settings() -> KeymapSettings {
    serde_json::from_str(EMBEDDED_DEFAULT_KEYMAP).unwrap_or_default()
}

fn load_keymap_settings_from_paths(
    path: &Path,
    default_path: Option<&Path>,
) -> Result<KeymapSettings, ErgoError> {
    // A resource file wins when present (packaged builds may ship an updated
    // keymap); otherwise the embedded copy applies.
    let default_settings = match default_path.filter(|path| path.exists()) {
        Some(default_path) => read_keymap_settings_from_path(default_path)
            .unwrap_or_else(|_| embedded_default_keymap_settings()),
        None => embedded_default_keymap_settings(),
    };

    if path.exists() {
        let user_settings = read_keymap_settings_from_path(path)?;

        return Ok(normalize_keymap_settings(KeymapSettings {
            keymap_profile: user_settings
                .keymap_profile
                .or(default_settings.keymap_profile),
            keymap_bindings: default_settings.keymap_bindings,
            keymap_overrides: user_settings.keymap_overrides,
            active_profile_id: user_settings.active_profile_id,
            profiles: user_settings.profiles,
        }));
    }

    Ok(normalize_keymap_settings(default_settings))
}

fn save_keymap_settings_to_path(path: &Path, settings: &KeymapSettings) -> Result<(), ErgoError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| ErgoError::Operation { message: error.to_string() })?;
    }

    let settings = normalize_keymap_settings(settings.clone());
    let mut contents = serde_json::to_value(&settings)
        .map_err(|error| ErgoError::Operation { message: error.to_string() })?;
    if let Some(object) = contents.as_object_mut() {
        object.remove("keymap_bindings");
    }

    let contents = serde_json::to_string_pretty(&contents)
        .map_err(|error| ErgoError::Operation { message: error.to_string() })?;
    fs::write(path, contents).map_err(|error| ErgoError::Operation { message: error.to_string() })
}

#[tauri::command]
pub fn load_global_settings(app: AppHandle) -> Result<GlobalSettings, ErgoError> {
    load_global_settings_from_path(&global_settings_path(&app)?)
}

fn save_global_settings_blocking(
    app: &AppHandle,
    settings: GlobalSettings,
) -> Result<GlobalSettingsSaveReport, ErgoError> {
    let _guard = GLOBAL_SETTINGS_SAVE_LOCK.lock();

    let path = global_settings_path(app)?;
    let previous = load_global_settings_from_path(&path).unwrap_or_default();

    save_global_settings_to_path(&path, &settings)?;

    let translation_server_error = translation_server::sync(
        &TranslationServerConfig::from_settings(&previous),
        &TranslationServerConfig::from_settings(&settings),
    )
    .err()
    .map(|error| error.to_string());

    Ok(GlobalSettingsSaveReport {
        translation_server_error,
    })
}

/// Writes the settings file, then reconciles the managed translation-server
/// container off the main thread (Docker may pull an image).
#[tauri::command]
pub async fn save_global_settings(
    app: AppHandle,
    settings: GlobalSettings,
) -> Result<GlobalSettingsSaveReport, ErgoError> {
    tauri::async_runtime::spawn_blocking(move || save_global_settings_blocking(&app, settings))
        .await
        .map_err(translation_server::blocking_task_error)?
}

pub fn load_translation_server_config(
    app: &AppHandle,
) -> Result<TranslationServerConfig, ErgoError> {
    let settings = load_global_settings(app.clone())?;
    Ok(TranslationServerConfig::from_settings(&settings))
}

#[tauri::command]
pub async fn get_translation_server_status(
    app: AppHandle,
) -> Result<TranslationServerStatus, ErgoError> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = load_translation_server_config(&app)?;
        Ok(translation_server::status(&config))
    })
    .await
    .map_err(translation_server::blocking_task_error)?
}

/// Starts the managed container at app start when the preference asks for it.
/// Callers run this off the main thread; a failure is left for the next settings
/// save to report.
pub fn ensure_translation_server_if_enabled(app: &AppHandle) {
    let Ok(config) = load_translation_server_config(app) else {
        return;
    };

    if !config.wants_managed_container() {
        return;
    }

    let _ = translation_server::ensure_running();
}

#[tauri::command]
pub fn load_keymap_settings(app: AppHandle) -> Result<KeymapSettings, ErgoError> {
    load_keymap_settings_from_paths(
        &keymap_settings_path(&app)?,
        default_keymap_settings_path(&app).as_deref(),
    )
}

#[tauri::command]
pub fn save_keymap_settings(app: AppHandle, settings: KeymapSettings) -> Result<(), ErgoError> {
    if let Some(state) = app.try_state::<crate::actions::ActionResolverState>() {
        crate::actions::refresh_cached_keymap(&state, settings.clone());
    }
    save_keymap_settings_to_path(&keymap_settings_path(&app)?, &settings)
}

#[tauri::command]
pub fn get_template_spec(
    state: State<'_, crate::app_state::TauriAppState>,
    template_id: String,
    variant_id: Option<String>,
) -> Result<TemplateSpec, ErgoError> {
    if ergo_core::bundled_templates::has_bundled_template_spec(&template_id) {
        let spec = load_bundled_template(&template_id)?;
        return Ok(resolve_template_variant(&spec, variant_id.as_deref()));
    }

    if let Ok(json) = state.vfs.read_source(ergo_core::bundled_templates::TEMPLATE_SPEC_PATH) {
        if let Ok(spec) = serde_json::from_str::<TemplateSpec>(&json) {
            if spec.metadata.id == template_id {
                return Ok(resolve_template_variant(&spec, variant_id.as_deref()));
            }
        }
    }
    let spec = load_bundled_template(&template_id)?;
    Ok(resolve_template_variant(&spec, variant_id.as_deref()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::{parse_key_sequence, ActionId};
    use ergo_core::settings::{KeyBindingPreference, DEFAULT_KEYMAP_PROFILE_ID};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_settings_path() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir()
            .join(format!("ergo-settings-test-{unique}"))
            .join(GLOBAL_SETTINGS_FILE_NAME)
    }

    fn temp_keymap_path() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir()
            .join(format!("ergo-keymap-test-{unique}"))
            .join(KEYMAP_SETTINGS_FILE_NAME)
    }

    fn temp_default_keymap_path() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir()
            .join(format!("ergo-default-keymap-test-{unique}"))
            .join(DEFAULT_KEYMAP_SETTINGS_RESOURCE)
    }

    #[test]
    fn app_config_files_live_under_ergo_folder() {
        let path = app_config_file_path_from_config_dir(
            Path::new("C:/Users/Ada/AppData/Roaming"),
            GLOBAL_SETTINGS_FILE_NAME,
        );

        assert_eq!(
            path,
            PathBuf::from("C:/Users/Ada/AppData/Roaming")
                .join("Ergo")
                .join(GLOBAL_SETTINGS_FILE_NAME)
        );
    }

    #[test]
    fn returns_defaults_when_settings_file_is_missing() {
        let path = temp_settings_path();

        let settings = load_global_settings_from_path(&path).unwrap();

        assert_eq!(settings.theme_mode.as_deref(), Some("system"));
        assert_eq!(settings.history_limit, Some(100));
        assert_eq!(settings.autosave_enabled, Some(true));
        assert_eq!(settings.autosave_interval_ms, Some(30_000));
        assert_eq!(settings.autosave_on_window_blur, Some(true));
        assert_eq!(settings.autosave_on_app_close, Some(true));
        assert_eq!(settings.autosave_on_project_close, Some(true));
    }

    #[test]
    fn fills_a_partial_user_file_with_shipped_defaults_and_drops_legacy_keys() {
        let path = temp_settings_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(
            &path,
            r#"{
  "theme_mode": "dark",
  "recent_projects": ["paper.ergproj"],
  "history_limit": 42,
  "keymap_profile": "ShouldNotFailParsing",
  "keymap_overrides": []
}"#,
        )
        .unwrap();

        let settings = load_global_settings_from_path(&path).unwrap();

        assert_eq!(settings.theme_mode.as_deref(), Some("dark"));
        assert_eq!(settings.recent_projects, vec!["paper.ergproj"]);
        assert_eq!(settings.history_limit, Some(42));
        assert_eq!(settings.locale.as_deref(), Some("en"));
        assert_eq!(settings.autosave_enabled, Some(true));
        assert_eq!(settings.autosave_interval_ms, Some(30_000));

        let _ = fs::remove_file(path);
    }

    #[test]
    fn rejects_extra_global_settings_fields() {
        let path = temp_settings_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(
            &path,
            r#"{
  "theme_mode": "system",
  "unknown_setting": true
}"#,
        )
        .unwrap();

        let error = load_global_settings_from_path(&path).unwrap_err();

        assert!(error.to_string().contains("unknown field"));

        let _ = fs::remove_file(path);
    }

    #[test]
    fn saved_settings_round_trip_through_the_file() {
        let path = temp_settings_path();
        let settings = GlobalSettings {
            theme_mode: Some("dark".to_string()),
            recent_projects: vec!["paper.ergproj".to_string()],
            workspace_columns: Some(ergo_core::settings::WorkspaceColumnWidths {
                sidebar: 260.0,
                editor: 480.0,
            }),
            ..GlobalSettings::default()
        };

        save_global_settings_to_path(&path, &settings).unwrap();
        let loaded = load_global_settings_from_path(&path).unwrap();

        assert_eq!(loaded.theme_mode.as_deref(), Some("dark"));
        assert_eq!(loaded.recent_projects, vec!["paper.ergproj"]);
        assert_eq!(
            loaded.workspace_columns,
            Some(ergo_core::settings::WorkspaceColumnWidths {
                sidebar: 260.0,
                editor: 480.0,
            })
        );
        assert_eq!(loaded.history_limit, GlobalSettings::default().history_limit);

        let _ = fs::remove_file(path);
    }

    #[test]
    fn loads_bundled_keymap_defaults_when_user_keymap_is_missing() {
        let path = temp_keymap_path();
        let default_path = temp_default_keymap_path();
        if let Some(parent) = default_path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(
            &default_path,
            r#"{
  "keymap_profile": "Default",
  "keymap_bindings": [
    {
      "action_id": "workspace::OpenProject",
      "context": "app",
      "sequence": [{ "key": "o", "modifiers": ["Control"] }]
    }
  ]
}"#,
        )
        .unwrap();

        let settings = load_keymap_settings_from_paths(&path, Some(&default_path)).unwrap();

        assert_eq!(settings.keymap_profile.as_deref(), Some("Default"));
        assert_eq!(settings.active_profile_id, DEFAULT_KEYMAP_PROFILE_ID);
        assert_eq!(settings.keymap_bindings.len(), 1);
        assert_eq!(
            settings.keymap_bindings[0].action_id,
            ActionId::WorkspaceOpenProject
        );

        let _ = fs::remove_file(default_path);
    }

    #[test]
    fn rejects_extra_keymap_fields() {
        let path = temp_keymap_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(
            &path,
            r#"{
  "keymap_profile": "Strict",
  "keymap_overrides": [
    {
      "action_id": "workspace::OpenProject",
      "context": "app",
      "sequence": [{ "key": "o", "modifiers": ["Control"] }],
      "keys": "Ctrl+O"
    }
  ]
}"#,
        )
        .unwrap();

        let error = load_keymap_settings_from_paths(&path, None).unwrap_err();

        assert!(error.to_string().contains("unknown field"));

        let _ = fs::remove_file(path);
    }

    #[test]
    fn loads_user_keymap_overrides_on_top_of_bundled_defaults() {
        let path = temp_keymap_path();
        let default_path = temp_default_keymap_path();
        if let Some(parent) = default_path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(
            &default_path,
            r#"{
  "keymap_profile": "Default",
  "keymap_bindings": [
    {
      "action_id": "workspace::OpenProject",
      "context": "app",
      "sequence": [{ "key": "o", "modifiers": ["Control"] }]
    }
  ],
  "keymap_overrides": []
}"#,
        )
        .unwrap();
        fs::write(
            &path,
            r#"{
  "keymap_profile": "Custom",
  "keymap_overrides": [
    {
      "action_id": "workspace::OpenProject",
      "context": "app",
      "sequence": [{ "key": "o", "modifiers": ["Control", "Alt"] }]
    }
  ]
}"#,
        )
        .unwrap();

        let settings = load_keymap_settings_from_paths(&path, Some(&default_path)).unwrap();

        assert_eq!(settings.keymap_profile.as_deref(), Some("Custom"));
        assert_eq!(settings.keymap_bindings.len(), 1);
        assert_eq!(settings.keymap_overrides.len(), 1);
        assert_eq!(
            settings.keymap_bindings[0].sequence,
            parse_key_sequence("Ctrl+O").unwrap()
        );
        assert_eq!(
            settings.keymap_overrides[0].sequence,
            parse_key_sequence("Ctrl+Alt+O").unwrap()
        );

        let _ = fs::remove_file(path);
        let _ = fs::remove_file(default_path);
    }

    #[test]
    fn returns_default_keymap_when_keymap_file_is_missing() {
        let path = temp_keymap_path();

        let settings = load_keymap_settings_from_paths(&path, None).unwrap();

        assert_eq!(settings.keymap_profile.as_deref(), Some("Default"));
        assert!(settings.keymap_overrides.is_empty());
    }

    #[test]
    fn persists_keymap_settings_in_separate_file() {
        let path = temp_keymap_path();
        let settings = KeymapSettings {
            keymap_profile: Some("Custom".to_string()),
            keymap_bindings: vec![KeyBindingPreference {
                action_id: ActionId::WorkspaceOpenProject,
                context: "app".to_string(),
                sequence: parse_key_sequence("Ctrl+O").unwrap(),
                payload: None,
            }],
            keymap_overrides: vec![KeyBindingPreference {
                action_id: ActionId::WorkspaceOpenProject,
                context: "workspace".to_string(),
                sequence: parse_key_sequence("Ctrl+O").unwrap(),
                payload: None,
            }],
            ..Default::default()
        };

        save_keymap_settings_to_path(&path, &settings).unwrap();
        let contents = fs::read_to_string(&path).unwrap();
        let loaded = load_keymap_settings_from_paths(&path, None).unwrap();

        assert!(!contents.contains("keymap_bindings"));
        assert_eq!(loaded.keymap_profile.as_deref(), Some("Custom"));
        // No resource file was given, so the keymap compiled into the binary
        // supplies the bundled bindings (a bare executable must still have
        // every default shortcut); the user's own bindings are never persisted.
        assert!(!loaded.keymap_bindings.is_empty());
        assert!(loaded
            .keymap_bindings
            .iter()
            .any(|binding| binding.action_id == ActionId::WorkspaceSaveProject));
        assert_eq!(loaded.keymap_overrides.len(), 1);
        assert_eq!(
            loaded.keymap_overrides[0].action_id,
            ActionId::WorkspaceOpenProject
        );

        let _ = fs::remove_file(path);
    }
}
