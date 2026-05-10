use ergo_lib::backend_profile::{
    run_backend_profile, BackendProfileOptions, BackendProfileReport, BackendProfileScenario,
};
use std::process::ExitCode;
use std::str::FromStr;

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("{message}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), String> {
    let (options, output_json) = parse_args(std::env::args().skip(1))?;
    let report = run_backend_profile(options)?;

    if output_json {
        println!(
            "{}",
            serde_json::to_string_pretty(&report).map_err(|error| error.to_string())?
        );
    } else {
        print_report(&report);
    }

    Ok(())
}

fn parse_args(
    mut args: impl Iterator<Item = String>,
) -> Result<(BackendProfileOptions, bool), String> {
    let mut options = BackendProfileOptions::default();
    let mut output_json = false;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--scenario" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--scenario needs a value".to_string())?;
                options.scenario = BackendProfileScenario::from_str(&value)?;
            }
            "--iterations" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--iterations needs a value".to_string())?;
                options.iterations = value
                    .parse::<usize>()
                    .map_err(|_| "--iterations must be a positive integer".to_string())?;
            }
            "--no-svg" => {
                options.render_svgs = false;
            }
            "--json" => {
                output_json = true;
            }
            "--help" | "-h" => {
                return Err(help_text());
            }
            _ => return Err(format!("Unknown argument '{arg}'.\n\n{}", help_text())),
        }
    }

    Ok((options, output_json))
}

fn print_report(report: &BackendProfileReport) {
    println!("Backend profile: {}", report.scenario);
    println!("Iterations: {}", report.iterations.len());
    println!(
        "Average: total={:.3}ms sync={:.3}ms compile={:.3}ms svg={:.3}ms write={:.3}ms",
        report.average.total_ms,
        report.average.sync_snapshot_ms,
        report.average.compile_ms,
        report.average.render_svg_ms,
        report.average.write_svg_ms
    );
    println!(
        "Total: total={:.3}ms sync={:.3}ms compile={:.3}ms svg={:.3}ms write={:.3}ms",
        report.total.total_ms,
        report.total.sync_snapshot_ms,
        report.total.compile_ms,
        report.total.render_svg_ms,
        report.total.write_svg_ms
    );

    if let Some(last) = report.iterations.last() {
        println!(
            "Last iteration: revision={} pages={} changed_pages={} fragments={}",
            last.source_revision,
            last.preview_page_count,
            last.changed_page_count,
            last.fragment_count
        );
    }
}

fn help_text() -> String {
    [
        "Usage: cargo run --release --bin backend_profile -- [options]",
        "",
        "Options:",
        "  --scenario <small-document|typing-title|large-document>",
        "  --iterations <count>",
        "  --no-svg",
        "  --json",
    ]
    .join("\n")
}
