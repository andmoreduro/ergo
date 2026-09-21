use std::process::Command;
use std::time::Duration;

use ergo_core::core_errors::ErgoError;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use ergo_core::settings::GlobalSettings;

/// Fixed Docker container name so Érgo can identify its translation-server instance.
pub const CONTAINER_NAME: &str = "ergo-zotero-translation-server";
const IMAGE: &str = "zotero/translation-server";
const HOST_PORT: &str = "1969";
const CONTAINER_PORT: &str = "1969";
/// Restart when the Docker engine starts (until Érgo removes the container on disable).
const RESTART_POLICY: &str = "unless-stopped";
/// Base URL of the container Érgo manages itself.
const MANAGED_BASE_URL: &str = "http://127.0.0.1:1969";
const LOOKUP_TIMEOUT: Duration = Duration::from_secs(20);
const PROBE_TIMEOUT: Duration = Duration::from_secs(1);

/// Where bibliography lookups go, resolved from global settings. This is the single
/// source of truth for the effective base URL.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranslationServerConfig {
    pub enabled: bool,
    pub base_url: String,
    /// True when Érgo runs the server itself in the managed Docker container.
    pub managed: bool,
}

impl TranslationServerConfig {
    pub fn from_settings(settings: &GlobalSettings) -> Self {
        let enabled = settings.zotero_translation_server_enabled.unwrap_or(false);
        let custom_url = settings
            .zotero_translation_server_url
            .as_deref()
            .map(str::trim)
            .filter(|url| !url.is_empty());

        match custom_url {
            Some(url) => Self {
                enabled,
                base_url: url.trim_end_matches('/').to_string(),
                managed: false,
            },
            None => Self {
                enabled,
                base_url: MANAGED_BASE_URL.to_string(),
                managed: true,
            },
        }
    }

    /// Whether the managed container should be up for this configuration.
    pub fn wants_managed_container(&self) -> bool {
        self.enabled && self.managed
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TranslationServerStatus {
    /// Docker CLI reachable. Always true when a custom server URL is configured.
    pub docker_available: bool,
    /// Managed container running; for a custom server URL, same as `ready`.
    pub running: bool,
    /// The server answered an HTTP probe.
    pub ready: bool,
    /// Managed container running but the server does not answer yet.
    pub starting: bool,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LookupCandidate {
    pub key: String,
    pub title: String,
}

/// Result of a bibliography metadata lookup, discriminated for user-facing messages.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[ts(export)]
pub enum BibliographyLookupOutcome {
    Found { biblatex: String },
    Disabled,
    ServerUnavailable,
    NotAnIdentifier,
    NotFound,
    /// The translation server found several items; the user picks one and the
    /// choice is sent back with `session` and `url`.
    Ambiguous {
        candidates: Vec<LookupCandidate>,
        session: String,
        url: String,
    },
    Failed { message: String },
}

/// Container action a settings save has to perform.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ContainerSyncAction {
    Start,
    Remove,
    None,
}

fn docker_command() -> Command {
    let mut command = Command::new("docker");
    // A GUI process spawning a console tool would flash a console window.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command.env("DOCKER_CLI_HINTS", "false");
    command
}

fn run_docker(args: &[&str]) -> Result<std::process::Output, ErgoError> {
    docker_command()
        .args(args)
        .output()
        .map_err(|error| {
            ErgoError::Operation {
                message: format!("Failed to run docker: {error}"),
            }
        })
}

pub fn docker_available() -> bool {
    run_docker(&["version", "--format", "{{.Server.Version}}"])
        .map(|output| output.status.success())
        .unwrap_or(false)
}

pub fn is_running() -> bool {
    let Ok(output) = run_docker(&[
        "inspect",
        "-f",
        "{{.State.Running}}",
        CONTAINER_NAME,
    ]) else {
        return false;
    };

    output.status.success() && String::from_utf8_lossy(&output.stdout).trim() == "true"
}

fn container_exists() -> bool {
    let Ok(output) = run_docker(&[
        "ps",
        "-a",
        "--filter",
        &format!("name=^{CONTAINER_NAME}$"),
        "--format",
        "{{.Names}}",
    ]) else {
        return false;
    };

    output.status.success()
        && String::from_utf8_lossy(&output.stdout)
            .lines()
            .any(|line| line.trim() == CONTAINER_NAME)
}

fn apply_restart_policy() -> Result<(), ErgoError> {
    let output = run_docker(&[
        "update",
        "--restart",
        RESTART_POLICY,
        CONTAINER_NAME,
    ])?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(ErgoError::Operation {
        message: format!(
            "Failed to set restart policy on {CONTAINER_NAME}: {stderr}"
        ),
    })
}

pub fn ensure_running() -> Result<(), ErgoError> {
    if !docker_available() {
        return Err(ErgoError::Operation {
            message: "Docker is not available".to_string(),
        });
    }

    if is_running() {
        if container_exists() {
            apply_restart_policy()?;
        }
        return Ok(());
    }

    if container_exists() {
        apply_restart_policy()?;
        let output = run_docker(&["start", CONTAINER_NAME])?;
        if output.status.success() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ErgoError::Operation {
            message: format!("Failed to start {CONTAINER_NAME}: {stderr}"),
        });
    }

    let output = run_docker(&[
        "run",
        "-d",
        "--name",
        CONTAINER_NAME,
        "--restart",
        RESTART_POLICY,
        "-p",
        &format!("127.0.0.1:{HOST_PORT}:{CONTAINER_PORT}"),
        IMAGE,
    ])?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(ErgoError::Operation {
        message: format!("Failed to create {CONTAINER_NAME}: {stderr}"),
    })
}

pub fn stop_and_remove() -> Result<(), ErgoError> {
    if !docker_available() {
        return Ok(());
    }

    if !container_exists() {
        return Ok(());
    }

    let output = run_docker(&["rm", "-f", CONTAINER_NAME])?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(ErgoError::Operation {
        message: format!("Failed to remove {CONTAINER_NAME}: {stderr}"),
    })
}

/// Decides what a settings save must do to the managed container. Docker is touched
/// only when the wanted container state differs from the previous one, or when the
/// container should be up but is not (so a transient start failure heals on the next
/// save). A custom server URL never starts a container; it only removes one Érgo
/// created earlier.
pub(crate) fn plan_container_sync(
    previous: &TranslationServerConfig,
    current: &TranslationServerConfig,
    container_running: impl FnOnce() -> bool,
) -> ContainerSyncAction {
    let wanted = current.wants_managed_container();
    let previously_wanted = previous.wants_managed_container();

    if wanted {
        if !previously_wanted || !container_running() {
            return ContainerSyncAction::Start;
        }
        return ContainerSyncAction::None;
    }

    if previously_wanted {
        return ContainerSyncAction::Remove;
    }

    ContainerSyncAction::None
}

/// Reconciles the managed container with the saved preference.
pub fn sync(
    previous: &TranslationServerConfig,
    current: &TranslationServerConfig,
) -> Result<(), ErgoError> {
    match plan_container_sync(previous, current, is_running) {
        ContainerSyncAction::Start => ensure_running(),
        ContainerSyncAction::Remove => stop_and_remove(),
        ContainerSyncAction::None => Ok(()),
    }
}

fn blocking_client(timeout: Duration) -> Result<reqwest::blocking::Client, reqwest::Error> {
    reqwest::blocking::Client::builder()
        .connect_timeout(timeout)
        .timeout(timeout)
        .build()
}

/// Whether the server answers HTTP at `base_url`. Any response (even 4xx) counts; a
/// refused connection or a timeout does not.
pub fn probe_ready(base_url: &str) -> bool {
    blocking_client(PROBE_TIMEOUT)
        .and_then(|client| client.get(base_url).send())
        .is_ok()
}

pub fn status(config: &TranslationServerConfig) -> TranslationServerStatus {
    if !config.managed {
        let ready = probe_ready(&config.base_url);
        return TranslationServerStatus {
            docker_available: true,
            running: ready,
            ready,
            starting: false,
            enabled: config.enabled,
        };
    }

    let docker_available = docker_available();
    let running = docker_available && is_running();
    let ready = running && probe_ready(&config.base_url);
    TranslationServerStatus {
        docker_available,
        running,
        ready,
        starting: running && !ready,
        enabled: config.enabled,
    }
}

pub fn lookup_endpoint_for_query(query: &str) -> &'static str {
    let trimmed = query.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        "web"
    } else {
        "search"
    }
}

/// Items to export, or the final outcome when a translate step ends the lookup.
type TranslateStep = Result<Vec<serde_json::Value>, BibliographyLookupOutcome>;

fn http_failure_message(status: u16, body: &str) -> String {
    let detail = body.trim();
    if detail.is_empty() {
        format!("translation server returned HTTP {status}")
    } else {
        format!("translation server returned HTTP {status}: {detail}")
    }
}

fn parse_items(body: &str) -> TranslateStep {
    match serde_json::from_str::<Vec<serde_json::Value>>(body) {
        Ok(items) if items.is_empty() => Err(BibliographyLookupOutcome::NotFound),
        Ok(items) => Ok(items),
        Err(error) => Err(BibliographyLookupOutcome::Failed {
            message: format!("invalid translation-server response: {error}"),
        }),
    }
}

/// HTTP 300 body from `/web`: `{ url, session, items: { key: title } }`.
#[derive(Deserialize)]
struct AmbiguousResponse {
    url: String,
    session: String,
    items: serde_json::Map<String, serde_json::Value>,
}

fn ambiguous_outcome(body: &str) -> BibliographyLookupOutcome {
    match serde_json::from_str::<AmbiguousResponse>(body) {
        Ok(response) => BibliographyLookupOutcome::Ambiguous {
            candidates: response
                .items
                .into_iter()
                .map(|(key, title)| LookupCandidate {
                    key,
                    title: match title {
                        serde_json::Value::String(title) => title,
                        other => other.to_string(),
                    },
                })
                .collect(),
            session: response.session,
            url: response.url,
        },
        Err(error) => BibliographyLookupOutcome::Failed {
            message: format!("invalid translation-server selection response: {error}"),
        },
    }
}

/// Maps a `/search` or `/web` response (status code + body) to items to export or
/// to a final outcome.
pub(crate) fn lookup_translate_outcome(status: u16, body: &str) -> TranslateStep {
    match status {
        200 => parse_items(body),
        300 => Err(ambiguous_outcome(body)),
        400 => Err(BibliographyLookupOutcome::NotAnIdentifier),
        501 if body.contains("No identifiers found") => {
            Err(BibliographyLookupOutcome::NotAnIdentifier)
        }
        501 => Err(BibliographyLookupOutcome::NotFound),
        _ => Err(BibliographyLookupOutcome::Failed {
            message: http_failure_message(status, body),
        }),
    }
}

/// Maps the `/web` response to a candidate selection.
pub(crate) fn selection_translate_outcome(status: u16, body: &str) -> TranslateStep {
    match status {
        200 => parse_items(body),
        _ => Err(BibliographyLookupOutcome::Failed {
            message: http_failure_message(status, body),
        }),
    }
}

/// Maps the `/export` response to the final outcome.
pub(crate) fn export_outcome(status: u16, body: &str) -> BibliographyLookupOutcome {
    if status != 200 {
        return BibliographyLookupOutcome::Failed {
            message: http_failure_message(status, body),
        };
    }

    let biblatex = body.trim();
    if biblatex.is_empty() {
        BibliographyLookupOutcome::NotFound
    } else {
        BibliographyLookupOutcome::Found {
            biblatex: biblatex.to_string(),
        }
    }
}

fn error_chain_message(error: &dyn std::error::Error) -> String {
    let mut message = error.to_string();
    let mut source = error.source();
    while let Some(cause) = source {
        message.push_str(": ");
        message.push_str(&cause.to_string());
        source = cause.source();
    }
    message
}

fn transport_outcome(
    error: &reqwest::Error,
    config: &TranslationServerConfig,
) -> BibliographyLookupOutcome {
    if error.is_connect() {
        return BibliographyLookupOutcome::ServerUnavailable;
    }

    if config.managed && !is_running() {
        return BibliographyLookupOutcome::ServerUnavailable;
    }

    BibliographyLookupOutcome::Failed {
        message: error_chain_message(error),
    }
}

fn read_response(
    result: Result<reqwest::blocking::Response, reqwest::Error>,
    config: &TranslationServerConfig,
) -> Result<(u16, String), BibliographyLookupOutcome> {
    let response = result.map_err(|error| transport_outcome(&error, config))?;
    let status = response.status().as_u16();
    let body = response
        .text()
        .map_err(|error| BibliographyLookupOutcome::Failed {
            message: error_chain_message(&error),
        })?;
    Ok((status, body))
}

fn export_first_item(
    client: &reqwest::blocking::Client,
    config: &TranslationServerConfig,
    items: Vec<serde_json::Value>,
) -> BibliographyLookupOutcome {
    let Some(item) = items.into_iter().next() else {
        return BibliographyLookupOutcome::NotFound;
    };

    let payload = match serde_json::to_string(&[item]) {
        Ok(payload) => payload,
        Err(error) => {
            return BibliographyLookupOutcome::Failed {
                message: error.to_string(),
            }
        }
    };

    let response = client
        .post(format!("{}/export?format=biblatex", config.base_url))
        .header("Content-Type", "application/json")
        .body(payload)
        .send();

    match read_response(response, config) {
        Ok((status, body)) => export_outcome(status, &body),
        Err(outcome) => outcome,
    }
}

/// Resolves an identifier or URL to BibLaTeX through `/search` or `/web`, then `/export`.
pub fn lookup(config: &TranslationServerConfig, query: &str) -> BibliographyLookupOutcome {
    if !config.enabled {
        return BibliographyLookupOutcome::Disabled;
    }

    let query = query.trim();
    if query.is_empty() {
        return BibliographyLookupOutcome::NotAnIdentifier;
    }

    let client = match blocking_client(LOOKUP_TIMEOUT) {
        Ok(client) => client,
        Err(error) => {
            return BibliographyLookupOutcome::Failed {
                message: error_chain_message(&error),
            }
        }
    };

    let endpoint = lookup_endpoint_for_query(query);
    let response = client
        .post(format!("{}/{endpoint}", config.base_url))
        .header("Content-Type", "text/plain")
        .body(query.to_string())
        .send();

    let items = match read_response(response, config)
        .and_then(|(status, body)| lookup_translate_outcome(status, &body))
    {
        Ok(items) => items,
        Err(outcome) => return outcome,
    };

    export_first_item(&client, config, items)
}

/// Sends the user's choice for an ambiguous `/web` lookup back to the translation
/// server (same `session` and `url`), then exports the chosen item.
pub fn select_candidate(
    config: &TranslationServerConfig,
    url: &str,
    session: &str,
    key: &str,
    title: &str,
) -> BibliographyLookupOutcome {
    if !config.enabled {
        return BibliographyLookupOutcome::Disabled;
    }

    let client = match blocking_client(LOOKUP_TIMEOUT) {
        Ok(client) => client,
        Err(error) => {
            return BibliographyLookupOutcome::Failed {
                message: error_chain_message(&error),
            }
        }
    };

    let mut items = serde_json::Map::new();
    items.insert(
        key.to_string(),
        serde_json::Value::String(title.to_string()),
    );
    let payload = serde_json::json!({
        "url": url,
        "session": session,
        "items": items,
    });

    let response = client
        .post(format!("{}/web", config.base_url))
        .header("Content-Type", "application/json")
        .body(payload.to_string())
        .send();

    let items = match read_response(response, config)
        .and_then(|(status, body)| selection_translate_outcome(status, &body))
    {
        Ok(items) => items,
        Err(outcome) => return outcome,
    };

    export_first_item(&client, config, items)
}

pub(crate) fn blocking_task_error(error: tauri::Error) -> ErgoError {
    ErgoError::Operation {
        message: format!("background task failed: {error}"),
    }
}

#[tauri::command]
pub async fn lookup_bibliography_metadata(
    app: tauri::AppHandle,
    query: String,
) -> Result<BibliographyLookupOutcome, ErgoError> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = crate::settings::load_translation_server_config(&app)?;
        Ok(lookup(&config, &query))
    })
    .await
    .map_err(blocking_task_error)?
}

#[tauri::command]
pub async fn select_bibliography_lookup_candidate(
    app: tauri::AppHandle,
    url: String,
    session: String,
    key: String,
    title: String,
) -> Result<BibliographyLookupOutcome, ErgoError> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = crate::settings::load_translation_server_config(&app)?;
        Ok(select_candidate(&config, &url, &session, &key, &title))
    })
    .await
    .map_err(blocking_task_error)?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(enabled: bool, url: Option<&str>) -> TranslationServerConfig {
        TranslationServerConfig::from_settings(&GlobalSettings {
            zotero_translation_server_enabled: Some(enabled),
            zotero_translation_server_url: url.map(str::to_string),
            ..GlobalSettings::default()
        })
    }

    #[test]
    fn lookup_endpoint_uses_web_for_urls() {
        assert_eq!(
            lookup_endpoint_for_query("https://example.com/paper"),
            "web"
        );
        assert_eq!(lookup_endpoint_for_query("http://example.com/paper"), "web");
    }

    #[test]
    fn lookup_endpoint_uses_search_for_identifiers() {
        assert_eq!(lookup_endpoint_for_query("10.1038/nature12373"), "search");
        assert_eq!(lookup_endpoint_for_query("978-0-306-40615-7"), "search");
    }

    #[test]
    fn config_uses_managed_container_unless_custom_url_is_set() {
        let managed = config(true, None);
        assert!(managed.managed);
        assert_eq!(managed.base_url, MANAGED_BASE_URL);
        assert!(managed.wants_managed_container());

        let blank = config(true, Some("   "));
        assert!(blank.managed);

        let custom = config(true, Some("  http://lab.example:8080/ "));
        assert!(!custom.managed);
        assert_eq!(custom.base_url, "http://lab.example:8080");
        assert!(!custom.wants_managed_container());
    }

    #[test]
    fn container_sync_plan_follows_wanted_state_and_heals_stopped_container() {
        let disabled = config(false, None);
        let enabled = config(true, None);
        let custom = config(true, Some("http://lab.example:8080"));

        assert_eq!(
            plan_container_sync(&disabled, &enabled, || false),
            ContainerSyncAction::Start
        );
        assert_eq!(
            plan_container_sync(&enabled, &enabled, || true),
            ContainerSyncAction::None
        );
        assert_eq!(
            plan_container_sync(&enabled, &enabled, || false),
            ContainerSyncAction::Start
        );
        assert_eq!(
            plan_container_sync(&enabled, &disabled, || true),
            ContainerSyncAction::Remove
        );
        assert_eq!(
            plan_container_sync(&enabled, &custom, || true),
            ContainerSyncAction::Remove
        );
        assert_eq!(
            plan_container_sync(&custom, &custom, || false),
            ContainerSyncAction::None
        );
        assert_eq!(
            plan_container_sync(&disabled, &disabled, || false),
            ContainerSyncAction::None
        );
    }

    #[test]
    fn lookup_is_disabled_without_the_setting() {
        assert_eq!(
            lookup(&config(false, None), "10.1038/nature12373"),
            BibliographyLookupOutcome::Disabled
        );
        assert_eq!(
            lookup(&config(true, None), "   "),
            BibliographyLookupOutcome::NotAnIdentifier
        );
    }

    #[test]
    fn translate_response_maps_to_items_or_outcome() {
        let items = lookup_translate_outcome(200, r#"[{"itemType":"journalArticle"}]"#)
            .expect("items");
        assert_eq!(items.len(), 1);

        assert_eq!(
            lookup_translate_outcome(200, "[]").unwrap_err(),
            BibliographyLookupOutcome::NotFound
        );
        assert_eq!(
            lookup_translate_outcome(400, "No URL specified").unwrap_err(),
            BibliographyLookupOutcome::NotAnIdentifier
        );
        assert_eq!(
            lookup_translate_outcome(501, "No identifiers found").unwrap_err(),
            BibliographyLookupOutcome::NotAnIdentifier
        );
        assert_eq!(
            lookup_translate_outcome(501, "No items returned from any translator")
                .unwrap_err(),
            BibliographyLookupOutcome::NotFound
        );
        assert!(matches!(
            lookup_translate_outcome(500, "An error occurred during translation").unwrap_err(),
            BibliographyLookupOutcome::Failed { message } if message.contains("500")
        ));
        assert!(matches!(
            lookup_translate_outcome(200, "not json").unwrap_err(),
            BibliographyLookupOutcome::Failed { .. }
        ));
    }

    #[test]
    fn multiple_results_become_ambiguous_candidates() {
        let outcome = lookup_translate_outcome(
            300,
            r#"{"url":"https://example.com/search?q=x","session":"abc123","items":{"https://example.com/a":"First paper","https://example.com/b":"Second paper"}}"#,
        )
        .unwrap_err();

        let BibliographyLookupOutcome::Ambiguous {
            candidates,
            session,
            url,
        } = outcome
        else {
            panic!("expected ambiguous outcome, got {outcome:?}");
        };
        assert_eq!(session, "abc123");
        assert_eq!(url, "https://example.com/search?q=x");
        assert_eq!(
            candidates,
            vec![
                LookupCandidate {
                    key: "https://example.com/a".to_string(),
                    title: "First paper".to_string(),
                },
                LookupCandidate {
                    key: "https://example.com/b".to_string(),
                    title: "Second paper".to_string(),
                },
            ]
        );

        assert!(matches!(
            lookup_translate_outcome(300, "{}").unwrap_err(),
            BibliographyLookupOutcome::Failed { .. }
        ));
    }

    #[test]
    fn selection_response_only_accepts_items() {
        assert_eq!(
            selection_translate_outcome(200, r#"[{"itemType":"book"}]"#)
                .expect("items")
                .len(),
            1
        );
        assert!(matches!(
            selection_translate_outcome(400, "Invalid session").unwrap_err(),
            BibliographyLookupOutcome::Failed { .. }
        ));
    }

    #[test]
    fn export_response_maps_to_found_or_failure() {
        assert_eq!(
            export_outcome(200, "\n@article{key,\n  title = {T}\n}\n"),
            BibliographyLookupOutcome::Found {
                biblatex: "@article{key,\n  title = {T}\n}".to_string()
            }
        );
        assert_eq!(export_outcome(200, "  "), BibliographyLookupOutcome::NotFound);
        assert!(matches!(
            export_outcome(500, "boom"),
            BibliographyLookupOutcome::Failed { message } if message.contains("boom")
        ));
    }
}
