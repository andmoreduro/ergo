import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "./styles/global.css";
import App from "./App";
import { TauriApi } from "./api/tauri";

const LOG_LEVELS: ("error" | "warn" | "info" | "log")[] = [
    "error",
    "warn",
    "info",
    "log",
];

function interceptConsole() {
    for (const level of LOG_LEVELS) {
        const original = console[level];
        console[level] = (...args: unknown[]) => {
            original.apply(console, args);
            try {
                const message = args
                    .map((arg) =>
                        typeof arg === "string" ? arg : JSON.stringify(arg),
                    )
                    .join(" ");
                void TauriApi.logToFile(level, message, "console");
            } catch {
                // Ignore logging failures to avoid recursion.
            }
        };
    }
}

interceptConsole();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
