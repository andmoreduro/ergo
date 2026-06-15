#!/usr/bin/env node
// Benchmark the real WASM engine artifact (src/wasm-compiler/) outside the app.
//
// Replays a body-typing scenario through the same calls the compiler worker
// makes per keystroke — sync_document_events → compile_preview → render_svg_page
// of the changed page — and prints per-step latencies. Node's V8 is not
// WebKitGTK/WebView2, so absolute numbers differ from the app, but A/B deltas
// from engine or build-flag changes transfer.
//
// Usage:
//   cd src-tauri
//   cargo run --release -p ergo-engine-wasm --bin wasm_preview_profile -- \
//     --dump-typing-body 1400 --iterations 30 > /tmp/typing-body.json
//   cd ..
//   pnpm build:wasm:dev
//   node scripts/wasm-keystroke-bench.mjs --scenario-file /tmp/typing-body.json
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = process.argv.slice(2);
let scenarioFile = null;
let warmup = 3;
for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--scenario-file") {
        scenarioFile = args[++index];
    } else if (args[index] === "--warmup") {
        warmup = Number(args[++index]);
    } else {
        console.error(`Unknown argument '${args[index]}'`);
        process.exit(1);
    }
}
if (!scenarioFile) {
    console.error(
        "Usage: node scripts/wasm-keystroke-bench.mjs --scenario-file <dump.json> [--warmup <n>]",
    );
    process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wasmDir = path.join(root, "src", "wasm-compiler");
const glue = await import(
    pathToFileURL(path.join(wasmDir, "ergo_engine_wasm.js")).href
);
const wasmBytes = await readFile(path.join(wasmDir, "ergo_engine_wasm_bg.wasm"));
await glue.default({ module_or_path: new Uint8Array(wasmBytes) });

const scenario = JSON.parse(await readFile(scenarioFile, "utf8"));
const compiler = new glue.ErgoWasmCompiler();

const bootstrapStart = performance.now();
const bootstrap = compiler.bootstrap_preview({
    ast: scenario.ast,
    files: scenario.files,
});
const bootstrapMs = performance.now() - bootstrapStart;
const pageCount = bootstrap.result.preview_pages?.length ?? 0;
console.log(
    `bootstrap: ${bootstrapMs.toFixed(0)}ms · pages: ${pageCount} · status: ${bootstrap.result.status}`,
);

const samples = [];
for (const event of scenario.events) {
    const syncStart = performance.now();
    compiler.sync_document_events([event]);
    const compileStart = performance.now();
    const result = compiler.compile_preview([]);
    const renderStart = performance.now();
    const changedIndex = (result.preview_pages ?? []).findIndex(
        (page) => page.changed,
    );
    if (changedIndex >= 0) {
        compiler.render_svg_page(changedIndex);
    }
    const renderEnd = performance.now();
    samples.push({
        sync: compileStart - syncStart,
        compile: renderStart - compileStart,
        render: renderEnd - renderStart,
        total: renderEnd - syncStart,
    });
}

const steady = samples.slice(Math.min(warmup, samples.length - 1));
const stats = (key) => {
    const values = steady.map((sample) => sample[key]).sort((a, b) => a - b);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const at = (q) => values[Math.min(values.length - 1, Math.floor(q * values.length))];
    return `${key} mean ${mean.toFixed(1)} · p50 ${at(0.5).toFixed(1)} · p90 ${at(0.9).toFixed(1)}`;
};
console.log(`keystrokes: ${samples.length} (stats over last ${steady.length})`);
for (const key of ["sync", "compile", "render", "total"]) {
    console.log(stats(key));
}
