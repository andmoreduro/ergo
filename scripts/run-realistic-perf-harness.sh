#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_PATH="${ERGO_PERF_PROJECT_PATH:-$HOME/Documents/tesis.ergproj}"
REPORT_PATH="${ERGO_PERF_REPORT_PATH:-$REPO_ROOT/src-tauri/target/perf-report.json}"
KEYSTROKES="${ERGO_PERF_KEYSTROKE_COUNT:-30}"
WARMUP="${ERGO_PERF_WARMUP_KEYSTROKES:-3}"
INTERVAL="${ERGO_PERF_KEYSTROKE_INTERVAL_MS:-80}"
# Optional manual preview zoom (e.g. 3 = 300%). High zoom exercises the
# visible-band raster path; leave unset to type at the default zoom.
ZOOM="${ERGO_PERF_ZOOM:-}"

echo "[ergo-perf] project:  $PROJECT_PATH"
echo "[ergo-perf] report:   $REPORT_PATH"
echo "[ergo-perf] strokes:  $KEYSTROKES (warmup $WARMUP)"
echo "[ergo-perf] zoom:     ${ZOOM:-default}"

export ERGO_PERF_ENABLED=1
export ERGO_PERF_PROJECT_PATH="$PROJECT_PATH"
export ERGO_PERF_REPORT_PATH="$REPORT_PATH"
export ERGO_PERF_KEYSTROKE_COUNT="$KEYSTROKES"
export ERGO_PERF_WARMUP_KEYSTROKES="$WARMUP"
export ERGO_PERF_KEYSTROKE_INTERVAL_MS="$INTERVAL"
if [[ -n "$ZOOM" ]]; then
    export ERGO_PERF_ZOOM="$ZOOM"
fi

cd "$REPO_ROOT"

if command -v xvfb-run >/dev/null 2>&1; then
    xvfb-run --auto-servernum pnpm tauri dev
else
    pnpm tauri dev
fi

echo "[ergo-perf] done"
if [[ -f "$REPORT_PATH" ]]; then
    echo "[ergo-perf] report:"
    cat "$REPORT_PATH"
fi
