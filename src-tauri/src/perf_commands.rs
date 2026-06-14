use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;

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
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PerfTelemetrySample {
    pub keystroke_index: usize,
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

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PerfReportSummary {
    pub sample_count: usize,
    pub total_latency_mean_ms: f64,
    pub total_latency_p50_ms: f64,
    pub total_latency_p90_ms: f64,
    pub compile_mean_ms: f64,
    pub compile_p50_ms: f64,
    pub compile_p90_ms: f64,
    pub svg_render_mean_ms: f64,
    pub schedule_mean_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PerfHarnessReport {
    pub config: PerfHarnessConfig,
    pub samples: Vec<PerfTelemetrySample>,
    pub summary: PerfReportSummary,
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
    PerfHarnessConfig {
        enabled: std::env::var("ERGO_PERF_ENABLED").is_ok_and(|v| v == "1"),
        project_path: std::env::var("ERGO_PERF_PROJECT_PATH").ok(),
        report_path: std::env::var("ERGO_PERF_REPORT_PATH").ok(),
        keystroke_count: env_usize("ERGO_PERF_KEYSTROKE_COUNT", 30),
        warmup_keystrokes: env_usize("ERGO_PERF_WARMUP_KEYSTROKES", 3),
        keystroke_interval_ms: env_u32("ERGO_PERF_KEYSTROKE_INTERVAL_MS", 80),
    }
}

#[tauri::command]
pub fn write_perf_report_and_exit(
    app_handle: AppHandle,
    report: PerfHarnessReport,
) -> Result<(), String> {
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
        .ok_or("report_path not configured")?;

    if let Some(parent) = report_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let json = serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?;
    std::fs::write(&report_path, json).map_err(|e| e.to_string())?;

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
    }
}
