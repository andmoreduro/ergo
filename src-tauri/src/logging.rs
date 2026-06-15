use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

fn log_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir failed: {e}"))?
        .join("logs");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create logs dir failed: {e}"))?;
    Ok(dir)
}

fn log_path(app: &AppHandle) -> Result<PathBuf, String> {
    let date = chrono::Local::now().format("%Y-%m-%d");
    Ok(log_dir(app)?.join(format!("ergo-{date}.log")))
}

fn format_log_line(level: &str, source: Option<&str>, message: &str) -> String {
    let timestamp = chrono::Local::now().to_rfc3339();
    let source_tag = source.map(|s| format!(" [{s}]")).unwrap_or_default();
    format!("{timestamp} [{level}]{source_tag} {message}\n")
}

#[tauri::command]
pub async fn log_to_file(
    app: AppHandle,
    level: String,
    message: String,
    source: Option<String>,
) -> Result<(), String> {
    let path = log_path(&app)?;
    let line = format_log_line(&level, source.as_deref(), &message);
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open log file failed: {e}"))?;
    file.write_all(line.as_bytes())
        .map_err(|e| format!("write log file failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn get_log_path(app: AppHandle) -> Result<String, String> {
    log_path(&app)
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}
