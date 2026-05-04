import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { documentDir as tauriDocumentDir } from "@tauri-apps/api/path";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { GlobalSettings } from "../bindings/GlobalSettings";
import type { KeymapSettings } from "../bindings/KeymapSettings";
import type { ActionContextSnapshot } from "../bindings/ActionContextSnapshot";
import type { ActionDescriptor } from "../bindings/ActionDescriptor";
import type { ActionResolution } from "../bindings/ActionResolution";
import type { KeymapValidationResult } from "../bindings/KeymapValidationResult";
import type { LogicalKeyEvent } from "../bindings/LogicalKeyEvent";
import type {
    DocumentEvent,
    DocumentSessionStatus,
} from "../types/documentSession";
import type {
    PreviewElementPositionsResult,
    PreviewJumpResult,
    PreviewSyncStatus,
} from "../types/previewSync";
import {
    COMPILE_DROPPED_EVENT,
    COMPILE_FAILED_EVENT,
    COMPILE_QUEUED_EVENT,
    COMPILE_STARTED_EVENT,
    COMPILE_SUCCEEDED_EVENT,
    type CompilationJob,
    type CompilationQueueSnapshot,
    type CompilationResult,
    type ExportFormat,
} from "../types/compilation";

export type CompileEventHandler = (result: CompilationResult) => void;

export interface CompileEventHandlers {
    onQueued?: CompileEventHandler;
    onStarted?: CompileEventHandler;
    onSucceeded?: CompileEventHandler;
    onFailed?: CompileEventHandler;
    onDropped?: CompileEventHandler;
}

/**
 * Tauri IPC Client API
 *
 * This module acts as the bridge between the React frontend and the Rust backend,
 * wrapping the Tauri `invoke` commands with strong TypeScript typing based on
 * the `ts-rs` auto-generated bindings.
 */
export const TauriApi = {
    /**
     * Writes the complete text content to a file in the In-Memory Virtual File System.
     *
     * @param path - The virtual path of the file (e.g., "main.typ")
     * @param text - The complete text content to write
     */
    async writeSource(path: string, text: string): Promise<void> {
        return invoke("write_source", { path, text });
    },

    /**
     * Applies an incremental text patch to a file in the In-Memory Virtual File System.
     *
     * @param path - The virtual path of the file (e.g., "main.typ")
     * @param start - The starting character index
     * @param end - The ending character index
     * @param text - The new text to insert or replace with
     */
    async patchSource(
        path: string,
        start: number,
        end: number,
        text: string,
    ): Promise<void> {
        return invoke("patch_source", { path, start, end, text });
    },

    /**
     * Triggers the embedded Typst compiler to render the current VFS state.
     *
     * @returns An array of SVG strings, where each string represents a rendered page.
     */
    async triggerCompile(): Promise<string[]> {
        return invoke("trigger_compile");
    },

    async enqueuePreviewCompile(debounceMs = 0): Promise<CompilationJob> {
        return invoke("enqueue_preview_compile", { debounceMs });
    },

    async enqueueExport(format: ExportFormat): Promise<CompilationJob> {
        return invoke("enqueue_export", { format });
    },

    async getCompileStatus(): Promise<CompilationQueueSnapshot> {
        return invoke("get_compile_status");
    },

    async syncDocumentSnapshot(ast: DocumentAST): Promise<DocumentSessionStatus> {
        return invoke("sync_document_snapshot", { ast });
    },

    async syncDocumentEvent(event: DocumentEvent): Promise<DocumentSessionStatus> {
        return invoke("sync_document_event", { event });
    },

    async getDocumentSessionStatus(): Promise<DocumentSessionStatus> {
        return invoke("get_document_session_status");
    },

    async readPreviewSvg(path: string): Promise<string> {
        return invoke("read_preview_svg", { path });
    },

    async jumpFromPreviewClick(
        pageNumber: number,
        xPt: number,
        yPt: number,
        sourceRevision: number,
    ): Promise<PreviewJumpResult> {
        return invoke("jump_from_preview_click", {
            pageNumber,
            xPt,
            yPt,
            sourceRevision,
        });
    },

    async getPreviewPositionsForElement(
        elementId: string,
        sourceRevision: number,
    ): Promise<PreviewElementPositionsResult> {
        return invoke("get_preview_positions_for_element", {
            elementId,
            sourceRevision,
        });
    },

    async getPreviewSyncStatus(): Promise<PreviewSyncStatus> {
        return invoke("get_preview_sync_status");
    },

    async listenToCompileEvents(
        handlers: CompileEventHandlers,
    ): Promise<UnlistenFn | null> {
        try {
            const unlisteners = await Promise.all([
                listen<CompilationResult>(COMPILE_QUEUED_EVENT, (event) =>
                    handlers.onQueued?.(event.payload),
                ),
                listen<CompilationResult>(COMPILE_STARTED_EVENT, (event) =>
                    handlers.onStarted?.(event.payload),
                ),
                listen<CompilationResult>(COMPILE_SUCCEEDED_EVENT, (event) =>
                    handlers.onSucceeded?.(event.payload),
                ),
                listen<CompilationResult>(COMPILE_FAILED_EVENT, (event) =>
                    handlers.onFailed?.(event.payload),
                ),
                listen<CompilationResult>(COMPILE_DROPPED_EVENT, (event) =>
                    handlers.onDropped?.(event.payload),
                ),
            ]);

            return () => {
                unlisteners.forEach((unlisten) => unlisten());
            };
        } catch {
            return null;
        }
    },

    /**
     * Saves the current DocumentAST and the entire VFS state into a zipped `.ergproj` archive.
     *
     * @param path - The physical host OS path to save the archive to
     * @param ast - The complete serialized Document AST state
     */
    async saveProject(path: string, ast: DocumentAST): Promise<void> {
        return invoke("save_project", { path, ast });
    },

    /**
     * Opens and unzips a `.ergproj` archive, populating the VFS and returning the AST.
     *
     * @param path - The physical host OS path of the archive to open
     * @returns The deserialized Document AST state extracted from the archive
     */
    async openProject(path: string): Promise<DocumentAST> {
        return invoke("open_project", { path });
    },

    async loadGlobalSettings(): Promise<GlobalSettings> {
        return invoke("load_global_settings");
    },

    async saveGlobalSettings(settings: GlobalSettings): Promise<void> {
        return invoke("save_global_settings", { settings });
    },

    async loadKeymapSettings(): Promise<KeymapSettings> {
        return invoke("load_keymap_settings");
    },

    async saveKeymapSettings(settings: KeymapSettings): Promise<void> {
        return invoke("save_keymap_settings", { settings });
    },

    async getActionCatalog(): Promise<ActionDescriptor[]> {
        return invoke("get_action_catalog");
    },

    async resolveKeyEvent(
        event: LogicalKeyEvent,
        contextSnapshot: ActionContextSnapshot,
    ): Promise<ActionResolution> {
        return invoke("resolve_key_event", {
            event,
            contextSnapshot,
        });
    },

    async resetKeySequence(windowId: string): Promise<void> {
        return invoke("reset_key_sequence", { windowId });
    },

    async validateKeymapSettings(
        settings: KeymapSettings,
    ): Promise<KeymapValidationResult> {
        return invoke("validate_keymap_settings", { settings });
    },

    async documentDir(): Promise<string> {
        return tauriDocumentDir();
    },
};
