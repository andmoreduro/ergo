use std::process::Command;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Fixed Docker container name so Érgo can identify its translation-server instance.
pub const CONTAINER_NAME: &str = "ergo-zotero-translation-server";
const IMAGE: &str = "zotero/translation-server";
const HOST_PORT: &str = "1969";
const CONTAINER_PORT: &str = "1969";
/// Restart when the Docker engine starts (until Érgo removes the container on disable).
const RESTART_POLICY: &str = "unless-stopped";

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TranslationServerStatus {
    pub docker_available: bool,
    pub running: bool,
    pub enabled: bool,
}

fn docker_command() -> Command {
    let mut command = Command::new("docker");
    command.env("DOCKER_CLI_HINTS", "false");
    command
}

fn run_docker(args: &[&str]) -> Result<std::process::Output, String> {
    docker_command()
        .args(args)
        .output()
        .map_err(|error| format!("Failed to run docker: {error}"))
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

fn apply_restart_policy() -> Result<(), String> {
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
    Err(format!(
        "Failed to set restart policy on {CONTAINER_NAME}: {stderr}"
    ))
}

pub fn ensure_running() -> Result<(), String> {
    if !docker_available() {
        return Err("Docker is not available".to_string());
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
        return Err(format!("Failed to start {CONTAINER_NAME}: {stderr}"));
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
    Err(format!("Failed to create {CONTAINER_NAME}: {stderr}"))
}

pub fn stop_and_remove() -> Result<(), String> {
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
    Err(format!("Failed to remove {CONTAINER_NAME}: {stderr}"))
}

pub fn sync_enabled(enabled: bool) -> Result<(), String> {
    if enabled {
        ensure_running()
    } else {
        stop_and_remove()
    }
}

pub fn status(enabled: bool) -> TranslationServerStatus {
    TranslationServerStatus {
        docker_available: docker_available(),
        running: is_running(),
        enabled,
    }
}

const TRANSLATION_SERVER_BASE_URL: &str = "http://127.0.0.1:1969";
const LOOKUP_TIMEOUT: Duration = Duration::from_secs(90);

pub fn lookup_endpoint_for_query(query: &str) -> &'static str {
    let trimmed = query.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        "web"
    } else {
        "search"
    }
}

#[tauri::command]
pub fn lookup_bibliography_metadata(query: String) -> Result<Option<String>, String> {
    lookup_bibliography_metadata_query(&query)
}

fn lookup_bibliography_metadata_query(query: &str) -> Result<Option<String>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(None);
    }

    if !is_running() {
        return Ok(None);
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(LOOKUP_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())?;

    let endpoint = lookup_endpoint_for_query(query);
    let translate_response = client
        .post(format!("{TRANSLATION_SERVER_BASE_URL}/{endpoint}"))
        .header("Content-Type", "text/plain")
        .body(query.to_string())
        .send()
        .map_err(|error| error.to_string())?;

    if translate_response.status().as_u16() == 300 {
        return Ok(None);
    }

    if !translate_response.status().is_success() {
        return Ok(None);
    }

    let items_json = translate_response
        .text()
        .map_err(|error| error.to_string())?;

    let items: Vec<serde_json::Value> = serde_json::from_str(&items_json)
        .map_err(|error| format!("Invalid translation-server response: {error}"))?;

    if items.is_empty() {
        return Ok(None);
    }

    let export_payload = serde_json::to_string(&vec![items[0].clone()])
        .map_err(|error| error.to_string())?;

    let export_response = client
        .post(format!(
            "{TRANSLATION_SERVER_BASE_URL}/export?format=bibtex"
        ))
        .header("Content-Type", "application/json")
        .body(export_payload)
        .send()
        .map_err(|error| error.to_string())?;

    if !export_response.status().is_success() {
        return Ok(None);
    }

    let bibtex = export_response
        .text()
        .map_err(|error| error.to_string())?
        .trim()
        .to_string();

    if bibtex.is_empty() {
        return Ok(None);
    }

    Ok(Some(bibtex))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn container_name_is_stable() {
        assert_eq!(CONTAINER_NAME, "ergo-zotero-translation-server");
    }

    #[test]
    fn status_reflects_enabled_flag() {
        let snapshot = status(true);
        assert!(snapshot.enabled);
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
}
