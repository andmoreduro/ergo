use ergo_engine_wasm::{run_wasm_preview_profile, WasmPreviewProfileOptions, WasmPreviewScenario};

#[test]
fn wasm_preview_profile_runs_sync_compile_and_canvas_render() {
    let report = run_wasm_preview_profile(WasmPreviewProfileOptions {
        scenario: WasmPreviewScenario::TypingTitle,
        iterations: 2,
        pixel_per_pt: 2.0,
    })
    .expect("wasm preview profile should complete");

    assert_eq!(report.iterations.len(), 2);
    assert!(report.iterations.iter().all(|iteration| {
        iteration.preview_page_count > 0 && iteration.rendered_page_count > 0
    }));
    assert!(report
        .iterations
        .iter()
        .all(|iteration| iteration.timings.total_ms >= iteration.timings.compile_ms));
    assert!(report.total.render_canvas_ms > 0.0);
}
