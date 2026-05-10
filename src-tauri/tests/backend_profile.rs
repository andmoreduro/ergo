use ergo_lib::backend_profile::{
    run_backend_profile, BackendProfileOptions, BackendProfileScenario,
};

#[test]
fn backend_profile_runs_preview_pipeline_and_reports_timings() {
    let report = run_backend_profile(BackendProfileOptions {
        scenario: BackendProfileScenario::TypingTitle,
        iterations: 2,
        render_svgs: true,
    })
    .expect("backend profile should compile and render the preview pipeline");

    assert_eq!(report.iterations.len(), 2);
    assert!(report
        .iterations
        .iter()
        .all(|iteration| iteration.preview_page_count > 0));
    assert!(report
        .iterations
        .iter()
        .all(|iteration| iteration.source_revision > 0));
    assert!(report.total.total_ms >= report.total.sync_snapshot_ms);
}
