import { invoke } from "@tauri-apps/api/core";
import { documentDir as tauriDocumentDir } from "@tauri-apps/api/path";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { GlobalSettings } from "../bindings/GlobalSettings";
import type { KeymapSettings } from "../bindings/KeymapSettings";
import type { ActionContextSnapshot } from "../bindings/ActionContextSnapshot";
import type { AssetEntry } from "../bindings/AssetEntry";
import type { OpenProjectResult } from "../bindings/OpenProjectResult";
import type { ActionDescriptor } from "../bindings/ActionDescriptor";
import type { ActionAvailability } from "../bindings/ActionAvailability";
import type { ContextDescriptor } from "../bindings/ContextDescriptor";
import type { ActionResolution } from "../bindings/ActionResolution";
import type { KeymapValidationResult } from "../bindings/KeymapValidationResult";
import type { LogicalKeyEvent } from "../bindings/LogicalKeyEvent";
import type { ProjectFontAvailability } from "../bindings/ProjectFontAvailability";
import type { ProjectSettings } from "../bindings/ProjectSettings";
import type { ReferenceEntry } from "../bindings/ReferenceEntry";
import type { DocumentEvent } from "../bindings/DocumentEvent";
import type { DocumentSessionStatus } from "../bindings/DocumentSessionStatus";
import type { TranslationServerStatus } from "../bindings/TranslationServerStatus";
import type { BibliographyLookupOutcome } from "../bindings/BibliographyLookupOutcome";
import type { GlobalSettingsSaveReport } from "../bindings/GlobalSettingsSaveReport";
import type { PerfHarnessConfig } from "../bindings/PerfHarnessConfig";
import type { PerfHarnessReport } from "../bindings/PerfHarnessReport";
import type { TemplateSpec } from "../bindings/TemplateSpec";

import { decodeFileBundle, encodeFileBundle, type BundledFile } from "./fileBundle";

export type { DocumentOutline } from "../bindings/DocumentOutline";

/**
 * Byte payloads cross IPC as raw bodies, never as JSON number arrays: responses
 * come back as an ArrayBuffer (decoded as views, no copy) and requests send the
 * bytes with metadata in percent-encoded headers. See `src-tauri/src/ipc.rs`.
 */
const rawHeaders = (headers: Record<string, string>) => ({
    headers: Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [key, encodeURIComponent(value)]),
    ),
});

const invokeBundle = async (
    command: string,
    args?: Record<string, unknown>,
): Promise<BundledFile[]> => decodeFileBundle(await invoke<ArrayBuffer>(command, args));

export const TauriApi = {
    async openDevTools(): Promise<void> {
        return invoke("open_devtools");
    },

    async writeBytesToPath(path: string, bytes: Uint8Array): Promise<void> {
        return invoke("write_bytes_to_path", bytes, rawHeaders({ "x-ergo-path": path }));
    },

    async writeZipExport(
        path: string,
        entries: Array<{ name: string; bytes: Uint8Array }>,
    ): Promise<void> {
        return invoke(
            "write_zip_export",
            encodeFileBundle(entries.map((entry) => ({ path: entry.name, bytes: entry.bytes }))),
            rawHeaders({ "x-ergo-path": path }),
        );
    },

    async generateReferencesBib(
        references: ReferenceEntry[],
    ): Promise<string> {
        return invoke("generate_references_bib", { references });
    },

    async loadFontsForDocument(ast: DocumentAST): Promise<Uint8Array[]> {
        const fonts = await invokeBundle("load_fonts_for_document", { ast });
        return fonts.map((font) => font.bytes);
    },

    async checkProjectFonts(
        settings: ProjectSettings,
    ): Promise<ProjectFontAvailability> {
        return invoke("check_project_fonts", { settings });
    },

    async resolveProjectFonts(settings: ProjectSettings): Promise<ProjectSettings> {
        return invoke("resolve_project_fonts", { settings });
    },

    async listSystemFontFamilies(): Promise<string[]> {
        return invoke("list_system_font_families");
    },

    async resetProjectSession(): Promise<void> {
        return invoke("reset_project_session");
    },

    async syncDocumentSnapshot(ast: DocumentAST): Promise<DocumentSessionStatus> {
        return invoke("sync_document_snapshot", { ast });
    },

    async syncDocumentEvents(
        events: DocumentEvent[],
    ): Promise<DocumentSessionStatus> {
        return invoke("sync_document_events", { events });
    },

    /** Copies a file from disk into the project VFS; read its bytes back with `readVfsFile`. */
    async importResourceFile(sourcePath: string): Promise<AssetEntry> {
        return invoke("import_resource_file", { sourcePath });
    },

    async importResourceBytes(fileName: string, bytes: Uint8Array): Promise<AssetEntry> {
        return invoke(
            "import_resource_bytes",
            bytes,
            rawHeaders({ "x-ergo-file-name": fileName }),
        );
    },

    async readVfsFile(path: string): Promise<Uint8Array> {
        return new Uint8Array(await invoke<ArrayBuffer>("read_vfs_file", { path }));
    },

    async writeGeneratedAsset(path: string, bytes: Uint8Array): Promise<void> {
        return invoke("write_generated_asset", bytes, rawHeaders({ "x-ergo-path": path }));
    },

    async saveProject(path: string): Promise<void> {
        return invoke("save_project", { path });
    },

    async openProject(path: string): Promise<OpenProjectResult> {
        return invoke("open_project", { path });
    },

    /** Files the WASM worker needs to bootstrap the project just opened. */
    async readWorkerBootstrapFiles(): Promise<BundledFile[]> {
        return invokeBundle("read_worker_bootstrap_files");
    },

    async loadGlobalSettings(): Promise<GlobalSettings> {
        return invoke("load_global_settings");
    },

    async saveGlobalSettings(
        settings: GlobalSettings,
    ): Promise<GlobalSettingsSaveReport> {
        return invoke("save_global_settings", { settings });
    },

    async getTranslationServerStatus(): Promise<TranslationServerStatus> {
        return invoke("get_translation_server_status");
    },

    async lookupBibliographyMetadata(
        query: string,
    ): Promise<BibliographyLookupOutcome> {
        return invoke("lookup_bibliography_metadata", { query });
    },

    /** Resolves an `ambiguous` lookup by sending the chosen candidate back to the server. */
    async selectBibliographyLookupCandidate(
        url: string,
        session: string,
        key: string,
        title: string,
    ): Promise<BibliographyLookupOutcome> {
        return invoke("select_bibliography_lookup_candidate", {
            url,
            session,
            key,
            title,
        });
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

    async getContextGlossary(): Promise<ContextDescriptor[]> {
        return invoke("get_context_glossary");
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

    /** Which catalog actions apply to `contextSnapshot`, with their effective shortcut there. */
    async listActionAvailability(
        contextSnapshot: ActionContextSnapshot,
    ): Promise<ActionAvailability[]> {
        return invoke("list_action_availability", { contextSnapshot });
    },

    async getTemplateSpec(
        templateId: string,
        variantId?: string | null,
    ): Promise<TemplateSpec> {
        return invoke("get_template_spec", {
            templateId,
            variantId: variantId ?? null,
        });
    },

    async loadTemplatePackageFiles(templateId: string): Promise<BundledFile[]> {
        return invokeBundle("load_template_package_files", { templateId });
    },

    async loadPackageFiles(name: string, version: string): Promise<BundledFile[]> {
        return invokeBundle("load_package_files", { name, version });
    },

    async getPerfConfig(): Promise<PerfHarnessConfig> {
        return invoke("get_perf_config");
    },

    async writePerfReportAndExit(report: PerfHarnessReport): Promise<void> {
        return invoke("write_perf_report_and_exit", { report });
    },

    async logToFile(
        level: string,
        message: string,
        source?: string,
    ): Promise<void> {
        return invoke("log_to_file", { level, message, source });
    },

    async getLogPath(): Promise<string> {
        return invoke("get_log_path");
    },

    async documentDir(): Promise<string> {
        return tauriDocumentDir();
    },
};
