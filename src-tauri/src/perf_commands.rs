use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use ergo_core::core_errors::ErgoError;
use tauri::AppHandle;

/// Which editing surface the typing phase targets.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, ts_rs::TS, PartialEq, Eq)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum PerfTypingTarget {
    /// ProseMirror body editor — append characters to the first paragraph, via
    /// direct `updateParagraphText` events (bypasses the input pipeline).
    Body,
    /// Template form field (e.g. `/title` input) dispatched as `updateInput`.
    FormTitle,
    /// Body editor — append N characters then delete them one at a time.
    /// Exercises the paragraph-shrink edit path, not just append.
    BodyDelete,
    /// Body editor — cycle single-character edits across three distinct
    /// paragraphs. Exercises per-element dirty tracking and multi-location
    /// layout, which a single-paragraph append never touches.
    BodyMultiEdit,
    /// Body editor — drive REAL ProseMirror transactions
    /// (`view.dispatch(tr.insertText(...))`) through the live editor. This
    /// exercises the full input pipeline (contenteditable → transaction →
    /// astBridge → sectionDiff → reducer) that the other targets bypass, so
    /// the `inputToCommitMs` telemetry reflects true perceived latency. The
    /// body editor must be focused/mounted before this target can type.
    BodyProseMirror,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PerfHarnessConfig {
    pub enabled: bool,
    pub project_path: Option<String>,
    pub report_path: Option<String>,
    pub keystroke_count: usize,
    pub warmup_keystrokes: usize,
    pub keystroke_interval_ms: u32,
    /// Manual preview zoom to apply before typing. High zoom exercises the
    /// raster-bound regime where visible-band rasterization matters most. `None`
    /// leaves the preview at its default zoom.
    pub zoom: Option<f32>,
    /// Which editing surface to drive during the typing phase.
    pub typing_target: PerfTypingTarget,
}

impl Default for PerfHarnessConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            project_path: None,
            report_path: None,
            keystroke_count: 30,
            warmup_keystrokes: 3,
            keystroke_interval_ms: 80,
            zoom: None,
            typing_target: PerfTypingTarget::Body,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PerfTelemetrySample {
    pub keystroke_index: usize,
    /// Earliest input (ProseMirror transaction) → AST event queued. Zero for
    /// non-ProseMirror targets that bypass the input pipeline.
    pub input_to_commit_ms: u32,
    pub total_latency_ms: u32,
    pub queued_to_sync_ms: u32,
    pub worker_sync_ms: u32,
    pub compile_ms: u32,
    pub svg_render_ms: u32,
    pub schedule_ms: u32,
    pub defer_ms: u32,
    pub commit_ms: u32,
    pub react_commit_ms: u32,
    pub paint_ms: u32,
    pub worker_render_ms: u32,
    pub dom_write_ms: u32,
    pub raster_ms: u32,
}

/// Wall-clock duration of a one-shot measurement (startup, project load, etc.).
/// No per-keystroke breakdown — just the total and a label for context.
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PerfOneShotTiming {
    /// Human-readable label, e.g. "appStart", "projectLoad".
    pub label: String,
    /// Total elapsed milliseconds.
    pub elapsed_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PerfReportSummary {
    pub sample_count: usize,
    /// Mean input→commit (the synchronous input-pipeline prefix). Zero for
    /// targets that bypass ProseMirror.
    pub input_to_commit_mean_ms: f64,
    pub total_latency_mean_ms: f64,
    pub total_latency_p50_ms: f64,
    pub total_latency_p90_ms: f64,
    pub compile_mean_ms: f64,
    pub compile_p50_ms: f64,
    pub compile_p90_ms: f64,
    pub svg_render_mean_ms: f64,
    pub schedule_mean_ms: f64,
    /// Mean of the first post-warmup keystroke across runs (when available).
    /// First-keystroke latency is typically much higher than steady state
    /// because of JIT warmup, font cache misses, and lazy module init.
    pub first_keystroke_ms: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PerfHarnessReport {
    pub config: PerfHarnessConfig,
    pub samples: Vec<PerfTelemetrySample>,
    pub summary: PerfReportSummary,
    /// One-shot timings collected before the typing loop:
    /// `appStart` (module eval → first paint) and `projectLoad` (openProject →
    /// first preview paint). Empty when not measured.
    #[serde(default)]
    pub one_shot_timings: Vec<PerfOneShotTiming>,
    /// Bootstrap-phase breakdown (open → first paint), when captured:
    /// template-package IPC, dependency-package IPC, AST transform, worker
    /// bootstrap compile. Empty when not measured.
    #[serde(default)]
    pub bootstrap_phases: BootstrapPhaseTimings,
}

/// Per-phase breakdown of the open → first-paint bootstrap.
#[derive(Debug, Clone, Default, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPhaseTimings {
    /// IPC round-trip for loading template package files (e.g. versatile-apa).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub template_package_load_ms: Option<f64>,
    /// IPC round-trip for loading dependency package files (e.g. mitex).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dependency_package_load_ms: Option<f64>,
    /// `documentAstForCompile` AST transform duration.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ast_transform_ms: Option<f64>,
    /// Worker round-trip for `CompilerClient.bootstrap` (VFS write + sync + compile).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worker_bootstrap_ms: Option<f64>,
}

fn env_usize(key: &str, default: usize) -> usize {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_u32(key: &str, default: u32) -> u32 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

#[tauri::command]
pub fn get_perf_config() -> PerfHarnessConfig {
    let typing_target = match std::env::var("ERGO_PERF_TYPING_TARGET")
        .unwrap_or_default()
        .as_str()
    {
        "form-title" => PerfTypingTarget::FormTitle,
        "body-delete" => PerfTypingTarget::BodyDelete,
        "body-multi-edit" => PerfTypingTarget::BodyMultiEdit,
        "body-prosemirror" => PerfTypingTarget::BodyProseMirror,
        _ => PerfTypingTarget::Body,
    };

    let config = PerfHarnessConfig {
        enabled: std::env::var("ERGO_PERF_ENABLED").is_ok_and(|v| v == "1"),
        project_path: std::env::var("ERGO_PERF_PROJECT_PATH").ok(),
        report_path: std::env::var("ERGO_PERF_REPORT_PATH").ok(),
        keystroke_count: env_usize("ERGO_PERF_KEYSTROKE_COUNT", 30),
        warmup_keystrokes: env_usize("ERGO_PERF_WARMUP_KEYSTROKES", 3),
        keystroke_interval_ms: env_u32("ERGO_PERF_KEYSTROKE_INTERVAL_MS", 80),
        zoom: std::env::var("ERGO_PERF_ZOOM")
            .ok()
            .and_then(|v| v.parse().ok()),
        typing_target,
    };

    config
}

#[tauri::command]
pub fn write_perf_report_and_exit(
    app_handle: AppHandle,
    report: PerfHarnessReport,
) -> Result<(), ErgoError> {
    let report_path = report
        .config
        .report_path
        .as_ref()
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var("ERGO_PERF_REPORT_PATH")
                .ok()
                .map(PathBuf::from)
        })
        .ok_or(ErgoError::Operation {
            message: "report_path not configured".to_string(),
        })?;

    if let Some(parent) = report_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| ErgoError::Operation { message: e.to_string() })?;
    }

    let json = serde_json::to_string_pretty(&report)
        .map_err(|e| ErgoError::Operation { message: e.to_string() })?;
    std::fs::write(&report_path, json).map_err(|e| ErgoError::Operation { message: e.to_string() })?;

    eprintln!("[ergo-perf] wrote report to {}", report_path.display());
    app_handle.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_perf_config_reads_env_vars() {
        // Set only the variables we want to verify; others keep defaults.
        std::env::set_var("ERGO_PERF_ENABLED", "1");
        std::env::set_var("ERGO_PERF_PROJECT_PATH", "/tmp/tesis.ergproj");
        std::env::set_var("ERGO_PERF_KEYSTROKE_COUNT", "42");
        std::env::set_var("ERGO_PERF_KEYSTROKE_INTERVAL_MS", "120");

        let config = get_perf_config();

        assert!(config.enabled);
        assert_eq!(config.project_path, Some("/tmp/tesis.ergproj".to_string()));
        assert_eq!(config.keystroke_count, 42);
        assert_eq!(config.keystroke_interval_ms, 120);
        assert_eq!(config.warmup_keystrokes, 3); // default

        std::env::remove_var("ERGO_PERF_ENABLED");
        std::env::remove_var("ERGO_PERF_PROJECT_PATH");
        std::env::remove_var("ERGO_PERF_KEYSTROKE_COUNT");
        std::env::remove_var("ERGO_PERF_KEYSTROKE_INTERVAL_MS");
    }

    #[test]
    fn get_perf_config_defaults_when_no_env() {
        // Ensure no env vars leak from other tests.
        for key in [
            "ERGO_PERF_ENABLED",
            "ERGO_PERF_PROJECT_PATH",
            "ERGO_PERF_REPORT_PATH",
            "ERGO_PERF_KEYSTROKE_COUNT",
            "ERGO_PERF_WARMUP_KEYSTROKES",
            "ERGO_PERF_KEYSTROKE_INTERVAL_MS",
            "ERGO_PERF_ZOOM",
            "ERGO_PERF_TYPING_TARGET",
        ] {
            std::env::remove_var(key);
        }

        let config = get_perf_config();

        assert!(!config.enabled);
        assert_eq!(config.project_path, None);
        assert_eq!(config.report_path, None);
        assert_eq!(config.keystroke_count, 30);
        assert_eq!(config.warmup_keystrokes, 3);
        assert_eq!(config.keystroke_interval_ms, 80);
        assert_eq!(config.zoom, None);
        assert_eq!(config.typing_target, PerfTypingTarget::Body);
    }
}
