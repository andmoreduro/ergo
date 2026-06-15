// Benchmark the real WASM engine artifact under WebKit's JavaScriptCore — the
// engine the Tauri app actually runs on Linux — instead of Node's V8.
//
// Same replay as scripts/wasm-keystroke-bench.mjs: per keystroke,
// sync_document_events → compile_preview → render_svg_page of the changed page.
// The bare JSC shell has no TextDecoder/TextEncoder/console, so minimal
// polyfills are installed before the wasm-bindgen glue is imported; the JS-side
// UTF-8 codec is slower than the browser-native one, which slightly inflates
// string-heavy steps relative to the app.
//
// Usage (from the repo root):
//   /usr/lib/webkit2gtk-4.1/jsc -m scripts/wasm-keystroke-bench.jsc.js \
//     -- /tmp/typing-body.json [<wasm-dir>]
// The scenario file comes from:
//   cargo run --release -p ergo-engine-wasm --bin wasm_preview_profile -- \
//     --dump-typing-body 1400 --iterations 30 > /tmp/typing-body.json
// <wasm-dir> defaults to src/wasm-compiler (paths resolved from the CWD).

globalThis.console = {
    log: (...parts) => print(parts.join(" ")),
    warn: (...parts) => print(parts.join(" ")),
    error: (...parts) => print(parts.join(" ")),
};

globalThis.TextEncoder = class {
    encode(text) {
        const bytes = [];
        for (let index = 0; index < text.length; index += 1) {
            const code = text.codePointAt(index);
            if (code > 0xffff) {
                index += 1;
            }
            if (code < 0x80) {
                bytes.push(code);
            } else if (code < 0x800) {
                bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
            } else if (code < 0x10000) {
                bytes.push(
                    0xe0 | (code >> 12),
                    0x80 | ((code >> 6) & 63),
                    0x80 | (code & 63),
                );
            } else {
                bytes.push(
                    0xf0 | (code >> 18),
                    0x80 | ((code >> 12) & 63),
                    0x80 | ((code >> 6) & 63),
                    0x80 | (code & 63),
                );
            }
        }
        return new Uint8Array(bytes);
    }
};

globalThis.TextDecoder = class {
    decode(input) {
        if (input === undefined) {
            return "";
        }
        const bytes =
            input instanceof Uint8Array
                ? input
                : new Uint8Array(input.buffer ?? input);
        let out = "";
        let index = 0;
        const length = bytes.length;
        while (index < length) {
            // ASCII fast path: decode plain runs in bulk.
            let runEnd = index;
            while (runEnd < length && bytes[runEnd] < 0x80) {
                runEnd += 1;
            }
            for (let start = index; start < runEnd; start += 0x2000) {
                out += String.fromCharCode.apply(
                    null,
                    bytes.subarray(start, Math.min(runEnd, start + 0x2000)),
                );
            }
            index = runEnd;
            if (index >= length) {
                break;
            }
            const byte = bytes[index];
            let code;
            if ((byte & 0xe0) === 0xc0) {
                code = ((byte & 31) << 6) | (bytes[index + 1] & 63);
                index += 2;
            } else if ((byte & 0xf0) === 0xe0) {
                code =
                    ((byte & 15) << 12) |
                    ((bytes[index + 1] & 63) << 6) |
                    (bytes[index + 2] & 63);
                index += 3;
            } else {
                code =
                    ((byte & 7) << 18) |
                    ((bytes[index + 1] & 63) << 12) |
                    ((bytes[index + 2] & 63) << 6) |
                    (bytes[index + 3] & 63);
                index += 4;
            }
            out += String.fromCodePoint(code);
        }
        return out;
    }
};

const cliArguments = typeof arguments === "undefined" ? [] : arguments;
const scenarioPath = cliArguments[0] ?? "/tmp/typing-body.json";
const wasmDir = cliArguments[1] ?? "src/wasm-compiler";
// Optional: replace the scenario's events with a captured stream from the live
// app (`window.__ergoPerf.events`), keeping that scenario's ast + files. This
// replays exactly what the real app sent, on the real project, through real WASM.
const eventsOverridePath = cliArguments[2] ?? null;

// Module specifiers resolve relative to this file; readFile relative to the CWD.
const glueSpecifier = wasmDir.startsWith("/")
    ? `${wasmDir}/ergo_engine_wasm.js`
    : `../${wasmDir}/ergo_engine_wasm.js`;
const glue = await import(glueSpecifier);
const wasmBytes = readFile(`${wasmDir}/ergo_engine_wasm_bg.wasm`, "binary");
// __wbg_init resolves to the wasm instance exports (incl. `.memory`).
const wasmExports = await glue.default({ module_or_path: wasmBytes });

const scenario = JSON.parse(readFile(scenarioPath));
if (eventsOverridePath) {
    scenario.events = JSON.parse(readFile(eventsOverridePath));
    console.log(`events overridden from ${eventsOverridePath}: ${scenario.events.length}`);
}
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

const wasmHeapMB = () => {
    try {
        return Math.round(wasmExports.memory.buffer.byteLength / 1024 / 1024);
    } catch {
        return 0;
    }
};

const samples = [];
let iteration = 0;
for (const event of scenario.events) {
    iteration += 1;
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
    if (iteration === 1 || iteration % 100 === 0) {
        console.log(
            `iter ${String(iteration).padStart(4)}  compile ${(renderStart - compileStart).toFixed(1)}ms  heap ${wasmHeapMB()}MB`,
        );
    }
}

const warmup = 3;
const steady = samples.slice(Math.min(warmup, samples.length - 1));
const stats = (key) => {
    const values = steady.map((sample) => sample[key]).sort((a, b) => a - b);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const at = (q) =>
        values[Math.min(values.length - 1, Math.floor(q * values.length))];
    return `${key} mean ${mean.toFixed(1)} · p50 ${at(0.5).toFixed(1)} · p90 ${at(0.9).toFixed(1)}`;
};
console.log(`keystrokes: ${samples.length} (stats over last ${steady.length})`);
for (const key of ["sync", "compile", "render", "total"]) {
    console.log(stats(key));
}
