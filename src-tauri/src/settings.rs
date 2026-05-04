use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::ast::{GlobalSettings, KeymapSettings};

const GLOBAL_SETTINGS_FILE_NAME: &str = "settings.json";
const KEYMAP_SETTINGS_FILE_NAME: &str = "keymap.json";
const DEFAULT_GLOBAL_SETTINGS_RESOURCE: &str = "defaults/default_settings.json";
const DEFAULT_KEYMAP_SETTINGS_RESOURCE: &str = "defaults/default_keymap.json";
const APP_CONFIG_DIR_NAME: &str = "Ergo";

fn app_config_file_path_from_config_dir(config_dir: &Path, file_name: &str) -> PathBuf {
    config_dir.join(APP_CONFIG_DIR_NAME).join(file_name)
}

fn app_config_file_path(app: &AppHandle, file_name: &str) -> Result<PathBuf, String> {
    app.path()
        .config_dir()
        .map(|directory| app_config_file_path_from_config_dir(&directory, file_name))
        .map_err(|error| error.to_string())
}

fn resource_file_path(app: &AppHandle, file_name: &str) -> Option<PathBuf> {
    app.path()
        .resource_dir()
        .ok()
        .map(|directory| directory.join(file_name))
}

fn global_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app_config_file_path(app, GLOBAL_SETTINGS_FILE_NAME)
}

fn default_global_settings_path(app: &AppHandle) -> Option<PathBuf> {
    resource_file_path(app, DEFAULT_GLOBAL_SETTINGS_RESOURCE)
}

fn keymap_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app_config_file_path(app, KEYMAP_SETTINGS_FILE_NAME)
}

fn default_keymap_settings_path(app: &AppHandle) -> Option<PathBuf> {
    resource_file_path(app, DEFAULT_KEYMAP_SETTINGS_RESOURCE)
}

fn read_global_settings_from_path(path: &Path) -> Result<GlobalSettings, String> {
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let mut settings: GlobalSettings =
        serde_json::from_str(&contents).map_err(|error| error.to_string())?;
    settings.keymap_profile = GlobalSettings::default().keymap_profile;
    settings.keymap_overrides = Vec::new();
    Ok(settings)
}

fn load_global_settings_from_paths(
    path: &Path,
    default_path: Option<&Path>,
) -> Result<GlobalSettings, String> {
    if path.exists() {
        return read_global_settings_from_path(path);
    }

    if let Some(default_path) = default_path.filter(|path| path.exists()) {
        return read_global_settings_from_path(default_path);
    }

    Ok(GlobalSettings::default())
}

fn save_global_settings_to_path(path: &Path, settings: &GlobalSettings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let mut contents = serde_json::to_value(settings).map_err(|error| error.to_string())?;
    if let Some(object) = contents.as_object_mut() {
        object.remove("keymap_profile");
        object.remove("keymap_overrides");
    }

    let contents = serde_json::to_string_pretty(&contents).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn read_keymap_settings_from_path(path: &Path) -> Result<KeymapSettings, String> {
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&contents).map_err(|error| error.to_string())
}

fn load_keymap_settings_from_paths(
    path: &Path,
    default_path: Option<&Path>,
) -> Result<KeymapSettings, String> {
    let default_settings = if let Some(default_path) = default_path.filter(|path| path.exists()) {
        read_keymap_settings_from_path(default_path)?
    } else {
        KeymapSettings::default()
    };

    if path.exists() {
        let user_settings = read_keymap_settings_from_path(path)?;

        return Ok(KeymapSettings {
            keymap_profile: user_settings
                .keymap_profile
                .or(default_settings.keymap_profile),
            keymap_bindings: default_settings.keymap_bindings,
            keymap_overrides: user_settings.keymap_overrides,
        });
    }

    Ok(default_settings)
}

fn save_keymap_settings_to_path(path: &Path, settings: &KeymapSettings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let mut contents = serde_json::to_value(settings).map_err(|error| error.to_string())?;
    if let Some(object) = contents.as_object_mut() {
        object.remove("keymap_bindings");
    }

    let contents = serde_json::to_string_pretty(&contents).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn load_global_settings(app: AppHandle) -> Result<GlobalSettings, String> {
    load_global_settings_from_paths(
        &global_settings_path(&app)?,
        default_global_settings_path(&app).as_deref(),
    )
}

#[tauri::command]
pub fn save_global_settings(app: AppHandle, settings: GlobalSettings) -> Result<(), String> {
    save_global_settings_to_path(&global_settings_path(&app)?, &settings)
}

#[tauri::command]
pub fn load_keymap_settings(app: AppHandle) -> Result<KeymapSettings, String> {
    load_keymap_settings_from_paths(
        &keymap_settings_path(&app)?,
        default_keymap_settings_path(&app).as_deref(),
    )
}

#[tauri::command]
pub fn save_keymap_settings(app: AppHandle, settings: KeymapSettings) -> Result<(), String> {
    save_keymap_settings_to_path(&keymap_settings_path(&app)?, &settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::{parse_key_sequence, ActionId, KeyBindingPreference};
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

    fn temp_default_settings_path() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir()
            .join(format!("ergo-default-settings-test-{unique}"))
            .join(DEFAULT_GLOBAL_SETTINGS_RESOURCE)
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

        let settings = load_global_settings_from_paths(&path, None).unwrap();

        assert_eq!(settings.theme_mode.as_deref(), Some("system"));
        assert_eq!(settings.history_limit, Some(100));
    }

    #[test]
    fn loads_bundled_global_defaults_when_user_settings_are_missing() {
        let path = temp_settings_path();
        let default_path = temp_default_settings_path();
        if let Some(parent) = default_path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(
            &default_path,
            r#"{
  "theme_mode": "dark",
  "locale": "es",
  "recent_projects": ["paper.ergproj"],
  "preview_debounce_ms": 200,
  "history_limit": 42,
  "keymap_profile": "ShouldNotLeak"
}"#,
        )
        .unwrap();

        let settings = load_global_settings_from_paths(&path, Some(&default_path)).unwrap();

        assert_eq!(settings.theme_mode.as_deref(), Some("dark"));
        assert_eq!(settings.locale.as_deref(), Some("es"));
        assert_eq!(settings.recent_projects, vec!["paper.ergproj"]);
        assert_eq!(settings.preview_debounce_ms, Some(200));
        assert_eq!(settings.history_limit, Some(42));
        assert_eq!(settings.keymap_profile.as_deref(), Some("Default"));
        assert!(settings.keymap_overrides.is_empty());

        let _ = fs::remove_file(default_path);
    }

    #[test]
    fn persists_global_settings() {
        let path = temp_settings_path();
        let mut settings = GlobalSettings::default();
        settings.theme_mode = Some("dark".to_string());
        settings.recent_projects = vec!["paper.ergproj".to_string()];
        settings.keymap_profile = Some("Custom".to_string());

        save_global_settings_to_path(&path, &settings).unwrap();
        let contents = fs::read_to_string(&path).unwrap();
        let loaded = load_global_settings_from_paths(&path, None).unwrap();

        assert!(!contents.contains("keymap_profile"));
        assert!(!contents.contains("keymap_overrides"));
        assert_eq!(loaded.theme_mode.as_deref(), Some("dark"));
        assert_eq!(loaded.recent_projects, vec!["paper.ergproj"]);
        assert_eq!(loaded.keymap_profile.as_deref(), Some("Default"));

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
  ],
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

        assert_eq!(settings.keymap_profile.as_deref(), Some("Default"));
        assert_eq!(settings.keymap_bindings.len(), 1);
        assert_eq!(settings.keymap_overrides.len(), 1);
        assert_eq!(
            settings.keymap_bindings[0].action_id,
            ActionId::WorkspaceOpenProject
        );
        assert_eq!(
            settings.keymap_overrides[0].action_id,
            ActionId::WorkspaceOpenProject
        );

        let _ = fs::remove_file(default_path);
    }

    #[test]
    fn loads_legacy_keymap_command_id_as_action_id() {
        let path = temp_keymap_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(
            &path,
            r#"{
  "keymap_profile": "Migrated",
  "keymap_overrides": [
    {
      "command_id": "project.open",
      "keys": "Ctrl+Alt+O",
      "scope": "global"
    }
  ]
}"#,
        )
        .unwrap();

        let settings = load_keymap_settings_from_paths(&path, None).unwrap();

        assert_eq!(settings.keymap_profile.as_deref(), Some("Migrated"));
        assert_eq!(
            settings.keymap_overrides[0].action_id,
            ActionId::WorkspaceOpenProject
        );
        assert_eq!(settings.keymap_overrides[0].context, "app");
        assert_eq!(
            settings.keymap_overrides[0].sequence,
            parse_key_sequence("Ctrl+Alt+O").unwrap()
        );

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
            }],
            keymap_overrides: vec![KeyBindingPreference {
                action_id: ActionId::WorkspaceOpenProject,
                context: "workspace".to_string(),
                sequence: parse_key_sequence("Ctrl+O").unwrap(),
            }],
        };

        save_keymap_settings_to_path(&path, &settings).unwrap();
        let contents = fs::read_to_string(&path).unwrap();
        let loaded = load_keymap_settings_from_paths(&path, None).unwrap();

        assert!(!contents.contains("keymap_bindings"));
        assert_eq!(loaded.keymap_profile.as_deref(), Some("Custom"));
        assert!(loaded.keymap_bindings.is_empty());
        assert_eq!(loaded.keymap_overrides.len(), 1);
        assert_eq!(
            loaded.keymap_overrides[0].action_id,
            ActionId::WorkspaceOpenProject
        );

        let _ = fs::remove_file(path);
    }
}
