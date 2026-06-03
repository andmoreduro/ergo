import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { paraglideVitePlugin } from "@inlang/paraglide-js";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

function reactDevToolsScriptPlugin(): Plugin {
  return {
    name: "react-devtools-script",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html.replace(
          "<head>",
          '<head>\n        <script src="http://localhost:8097"></script>',
        );
      },
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
      emitTsDeclarations: true,
    }),
    react(),
    // Injects the script from `pnpm react-devtools` (port 8097). Start DevTools
    // before loading the app; if it is not running, the script fails harmlessly.
    mode === "development" ? reactDevToolsScriptPlugin() : undefined,
  ].filter((plugin) => plugin !== undefined),

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
