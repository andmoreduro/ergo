#!/usr/bin/env bash
set -euo pipefail

# Comprehensive performance suite for Érgo.
#
# Runs the realistic perf harness across multiple scenarios and collects
# reports into a timestamped directory. Each run launches the full Tauri
# app, so this takes several minutes.
#
# Scenarios:
#   1. medium-body   — tesis.ergproj, body paragraph typing
#   2. medium-form   — tesis.ergproj, form title field typing
#   3. small-body    — freshly created small project, body typing
#   4. small-form    — freshly created small project, form title typing
#
# Usage:
#   ./scripts/run-perf-suite.sh
#   KEYSTROKES=50 ./scripts/run-perf-suite.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MEDIUM_PROJECT="${ERGO_PERF_PROJECT_PATH:-$HOME/Documents/tesis.ergproj}"
KEYSTROKES="${KEYSTROKES:-30}"
WARMUP="${WARMUP:-3}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
REPORT_DIR="$REPO_ROOT/src-tauri/target/perf-suite-$TIMESTAMP"

mkdir -p "$REPORT_DIR"

echo "[ergo-perf-suite] reports → $REPORT_DIR"
echo "[ergo-perf-suite] medium project: $MEDIUM_PROJECT"
echo "[ergo-perf-suite] keystrokes: $KEYSTROKES (warmup $WARMUP)"
echo ""

run_scenario() {
    local name="$1"
    local project_path="$2"
    local typing_target="$3"
    local report="$REPORT_DIR/$name.json"

    echo "══════════════════════════════════════════════════════════"
    echo "  Scenario: $name"
    echo "  Project:  $project_path"
    echo "  Target:   $typing_target"
    echo "══════════════════════════════════════════════════════════"

    ERGO_PERF_PROJECT_PATH="$project_path" \
    ERGO_PERF_REPORT_PATH="$report" \
    ERGO_PERF_KEYSTROKE_COUNT="$KEYSTROKES" \
    ERGO_PERF_WARMUP_KEYSTROKES="$WARMUP" \
    ERGO_PERF_TYPING_TARGET="$typing_target" \
    "$REPO_ROOT/scripts/run-realistic-perf-harness.sh" 2>&1 | tail -5

    echo ""
    if [[ -f "$report" ]]; then
        # Extract key metrics for a quick summary
        python3 -c "
import json, sys
with open('$report') as f:
    r = json.load(f)
oneshot = {t['label']: t['elapsedMs'] for t in r.get('oneShotTimings', [])}
s = r['summary']
print(f\"  appStart:     {oneshot.get('appStart', 'N/A')} ms\")
print(f\"  projectLoad:  {oneshot.get('projectLoad', 'N/A')} ms\")
print(f\"  total mean:   {s['totalLatencyMeanMs']:.1f} ms\")
print(f\"  total p50:    {s['totalLatencyP50Ms']:.1f} ms\")
print(f\"  total p90:    {s['totalLatencyP90Ms']:.1f} ms\")
print(f\"  first stroke: {s.get('firstKeystrokeMs', 'N/A')} ms\")
print(f\"  compile mean: {s['compileMeanMs']:.1f} ms\")
" 2>/dev/null || echo "  (could not parse report)"
    else
        echo "  (no report generated)"
    fi
    echo ""
}

# Scenarios 1 & 2: medium project (tesis.ergproj)
if [[ -f "$MEDIUM_PROJECT" ]]; then
    run_scenario "medium-body" "$MEDIUM_PROJECT" "body"
    run_scenario "medium-body-delete" "$MEDIUM_PROJECT" "body-delete"
    run_scenario "medium-body-multi-edit" "$MEDIUM_PROJECT" "body-multi-edit"
    run_scenario "medium-form" "$MEDIUM_PROJECT" "form-title"
else
    echo "[ergo-perf-suite] WARNING: medium project not found at $MEDIUM_PROJECT, skipping"
fi

# Scenarios 3 & 4: small project
# The harness opens whatever .ergproj is at ERGO_PERF_PROJECT_PATH. For a
# small project, we create a minimal one if it doesn't exist.
SMALL_PROJECT="/tmp/ergo-perf-small.ergproj"
if [[ ! -f "$SMALL_PROJECT" ]]; then
    echo "[ergo-perf-suite] creating small project at $SMALL_PROJECT"
    # We can't easily create a .ergproj from bash — the app does it.
    # Instead, use the untitled_document.ergproj if it exists.
    SMALL_PROJECT="$HOME/Documents/untitled_document.ergproj"
fi

if [[ -f "$SMALL_PROJECT" ]]; then
    run_scenario "small-body" "$SMALL_PROJECT" "body"
    run_scenario "small-body-delete" "$SMALL_PROJECT" "body-delete"
    run_scenario "small-body-multi-edit" "$SMALL_PROJECT" "body-multi-edit"
    run_scenario "small-form" "$SMALL_PROJECT" "form-title"
else
    echo "[ergo-perf-suite] WARNING: no small project found, skipping small-* scenarios"
    echo "  Place a small .ergproj at $HOME/Documents/untitled_document.ergproj"
    echo "  or /tmp/ergo-perf-small.ergproj"
fi

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Suite complete. Reports in: $REPORT_DIR"
echo "══════════════════════════════════════════════════════════"
