import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { documentDir as tauriDocumentDir } from "@tauri-apps/api/path";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { GlobalSettings } from "../bindings/GlobalSettings";
import type { KeymapSettings } from "../bindings/KeymapSettings";
import type { ActionContextSnapshot } from "../bindings/ActionContextSnapshot";
import type { AssetEntry } from "../bindings/AssetEntry";
import type { ActionDescriptor } from "../bindings/ActionDescriptor";
import type { ActionResolution } from "../bindings/ActionResolution";
import type { KeymapValidationResult } from "../bindings/KeymapValidationResult";
import type { LogicalKeyEvent } from "../bindings/LogicalKeyEvent";
import type { DocumentEvent } from "../bindings/DocumentEvent";
import type { DocumentSessionStatus } from "../bindings/DocumentSessionStatus";
import type { PreviewElementPositionsResult } from "../bindings/PreviewElementPositionsResult";
import type { PreviewFocusTarget } from "../bindings/PreviewFocusTarget";
import type { PreviewJumpResult } from "../bindings/PreviewJumpResult";
import type { PreviewSyncStatus } from "../bindings/PreviewSyncStatus";
import {
    COMPILE_FAILED_EVENT,
    COMPILE_STARTED_EVENT,
    COMPILE_SUCCEEDED_EVENT,
    RESOURCES_UPDATED_EVENT,
} from "./compileEvents";
import type { CompilationResult } from "../bindings/CompilationResult";
import type { DocumentResources } from "../bindings/DocumentResources";
import type { ExportFormat } from "../bindings/ExportFormat";
import type { TemplateSpec } from "../bindings/TemplateSpec";

export type { DocumentOutline } from "../bindings/DocumentOutline";

export type CompileEventHandler = (result: CompilationResult) => void;

export interface CompileEventHandlers {
    onStarted?: CompileEventHandler;
    onSucceeded?: CompileEventHandler;
    onFailed?: CompileEventHandler;
}

export const TauriApi = {
    async writeSource(path: string, text: string): Promise<void> {
        return invoke("write_source", { path, text });
    },

    async patchSource(
        path: string,
        start: number,
        end: number,
        text: string,
    ): Promise<void> {
        return invoke("patch_source", { path, start, end, text });
    },

    async startPreviewWatch(): Promise<void> {
        return invoke("start_preview_watch");
    },

    async stopPreviewWatch(): Promise<void> {
        return invoke("stop_preview_watch");
    },

    async exportDocument(format: ExportFormat): Promise<CompilationResult> {
        return invoke("export_document", { format });
    },

    async syncDocumentSnapshot(ast: DocumentAST): Promise<DocumentSessionStatus> {
        return invoke("sync_document_snapshot", { ast });
    },

    async syncDocumentEvent(event: DocumentEvent): Promise<DocumentSessionStatus> {
        return invoke("sync_document_event", { event });
    },

    async syncDocumentEvents(
        events: DocumentEvent[],
    ): Promise<DocumentSessionStatus> {
        return invoke("sync_document_events", { events });
    },

    async getDocumentSessionStatus(): Promise<DocumentSessionStatus> {
        return invoke("get_document_session_status");
    },

    async readResourcePreviewSvg(path: string): Promise<string> {
        return invoke("read_resource_preview_svg", { path });
    },

    async importResourceFile(sourcePath: string): Promise<AssetEntry> {
        return invoke("import_resource_file", { sourcePath });
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

    async getPreviewPositionsForFocus(
        target: PreviewFocusTarget,
        sourceRevision: number,
    ): Promise<PreviewElementPositionsResult> {
        return invoke("get_preview_positions_for_focus", {
            target,
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
                listen<CompilationResult>(COMPILE_STARTED_EVENT, (event) =>
                    handlers.onStarted?.(event.payload),
                ),
                listen<CompilationResult>(COMPILE_SUCCEEDED_EVENT, (event) =>
                    handlers.onSucceeded?.(event.payload),
                ),
                listen<CompilationResult>(COMPILE_FAILED_EVENT, (event) =>
                    handlers.onFailed?.(event.payload),
                ),
            ]);

            return () => {
                unlisteners.forEach((unlisten) => unlisten());
            };
        } catch {
            return null;
        }
    },

    async listenToResourcesEvents(
        onUpdate: (resources: DocumentResources) => void,
    ): Promise<UnlistenFn | null> {
        try {
            const unlisten = await listen<DocumentResources>(RESOURCES_UPDATED_EVENT, (event) => {
                onUpdate(event.payload);
            });
            return unlisten;
        } catch {
            return null;
        }
    },

    async saveProject(path: string): Promise<void> {
        return invoke("save_project", { path });
    },

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

    async getTemplateSpec(templateId: string): Promise<TemplateSpec> {
        return invoke("get_template_spec", { templateId });
    },

    async documentDir(): Promise<string> {
        return tauriDocumentDir();
    },
};
