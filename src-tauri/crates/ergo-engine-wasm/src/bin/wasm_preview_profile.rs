use ergo_engine_wasm::{
    run_wasm_preview_profile, WasmPreviewProfileOptions, WasmPreviewScenario,
};
use std::env;
use std::str::FromStr;

fn main() -> Result<(), String> {
    let (options, json) = parse_args(env::args().skip(1).collect())?;
    let report = run_wasm_preview_profile(options)?;

    if json {
        println!("{}", serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?);
        return Ok(());
    }

    print_report(&report);
    Ok(())
}

fn parse_args(args: Vec<String>) -> Result<(WasmPreviewProfileOptions, bool), String> {
    let mut options = WasmPreviewProfileOptions::default();
    let mut json = false;
    let mut index = 0;

    while index < args.len() {
        match args[index].as_str() {
            "--scenario" => {
                index += 1;
                let value = args
                    .get(index)
                    .ok_or_else(|| "--scenario requires a value".to_string())?;
                options.scenario = WasmPreviewScenario::from_str(value)?;
            }
            "--iterations" => {
                index += 1;
                let value = args
                    .get(index)
                    .ok_or_else(|| "--iterations requires a value".to_string())?;
                options.iterations = value
                    .parse()
                    .map_err(|error| format!("Invalid iterations '{value}': {error}"))?;
            }
            "--pixel-per-pt" => {
                index += 1;
                let value = args
                    .get(index)
                    .ok_or_else(|| "--pixel-per-pt requires a value".to_string())?;
                options.pixel_per_pt = value
                    .parse()
                    .map_err(|error| format!("Invalid pixel-per-pt '{value}': {error}"))?;
            }
            "--json" => json = true,
            "--help" | "-h" => {
                print_help();
                std::process::exit(0);
            }
            flag => return Err(format!("Unknown argument '{flag}'")),
        }
        index += 1;
    }

    Ok((options, json))
}

fn print_report(report: &ergo_engine_wasm::WasmPreviewProfileReport) {
    println!("WASM preview profile: {}", report.scenario);
    println!("Iterations: {}", report.requested_iterations);
    println!(
        "Average (ms): sync {:.2}, compile {:.2}, render {:.2}, total {:.2}",
        report.average.sync_ms,
        report.average.compile_ms,
        report.average.render_canvas_ms,
        report.average.total_ms
    );
    println!(
        "Total (ms): sync {:.2}, compile {:.2}, render {:.2}, total {:.2}",
        report.total.sync_ms,
        report.total.compile_ms,
        report.total.render_canvas_ms,
        report.total.total_ms
    );
}

fn print_help() {
    println!(
        "Usage: cargo run --release -p ergo-engine-wasm --bin wasm_preview_profile -- [options]",
    );
    println!();
    println!("Options:");
    println!("  --scenario <name>       small-document | typing-title | large-document");
    println!("  --iterations <count>    Number of preview cycles (default: 100)");
    println!("  --pixel-per-pt <value>  Canvas raster density (default: 2.0)");
    println!("  --json                  Emit JSON report");
}
