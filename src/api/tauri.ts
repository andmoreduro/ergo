import { invoke } from "@tauri-apps/api/core";
import { documentDir as tauriDocumentDir } from "@tauri-apps/api/path";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { GlobalSettings } from "../bindings/GlobalSettings";
import type { KeymapSettings } from "../bindings/KeymapSettings";
import type { ActionContextSnapshot } from "../bindings/ActionContextSnapshot";
import type { ImportResourceResult } from "../bindings/ImportResourceResult";
import type { OpenProjectResult } from "../bindings/OpenProjectResult";
import type { ActionDescriptor } from "../bindings/ActionDescriptor";
import type { ActionResolution } from "../bindings/ActionResolution";
import type { KeymapValidationResult } from "../bindings/KeymapValidationResult";
import type { LogicalKeyEvent } from "../bindings/LogicalKeyEvent";
import type { ProjectFile } from "../bindings/ProjectFile";
import type { DocumentEvent } from "../bindings/DocumentEvent";
import type { DocumentSessionStatus } from "../bindings/DocumentSessionStatus";
import type { TemplateSpec } from "../bindings/TemplateSpec";

export type { DocumentOutline } from "../bindings/DocumentOutline";

export const TauriApi = {
    async openDevTools(): Promise<void> {
        return invoke("open_devtools");
    },

    async writeBytesToPath(path: string, bytes: Uint8Array): Promise<void> {
        return invoke("write_bytes_to_path", { path, bytes: Array.from(bytes) });
    },

    async writeZipExport(
        path: string,
        entries: Array<{ name: string; bytes: Uint8Array }>,
    ): Promise<void> {
        return invoke("write_zip_export", {
            path,
            entries: entries.map((entry) => ({
                name: entry.name,
                bytes: Array.from(entry.bytes),
            })),
        });
    },

    async loadFontsForDocument(ast: DocumentAST): Promise<Uint8Array[]> {
        const buffers = await invoke<number[][]>("load_fonts_for_document", { ast });
        return buffers.map((buf) => new Uint8Array(buf));
    },

    async listSystemFontFamilies(): Promise<string[]> {
        return invoke("list_system_font_families");
    },

    async syncDocumentSnapshot(ast: DocumentAST): Promise<DocumentSessionStatus> {
        return invoke("sync_document_snapshot", { ast });
    },

    async syncDocumentEvents(
        events: DocumentEvent[],
    ): Promise<DocumentSessionStatus> {
        return invoke("sync_document_events", { events });
    },

    async importResourceFile(sourcePath: string): Promise<ImportResourceResult> {
        return invoke("import_resource_file", { sourcePath });
    },

    async importResourceBytes(
        fileName: string,
        bytes: Uint8Array,
    ): Promise<ImportResourceResult> {
        const result = await invoke<ImportResourceResult>("import_resource_bytes", {
            fileName,
            bytes: Array.from(bytes),
        });
        return {
            asset: result.asset,
            bytes: new Uint8Array(result.bytes),
        };
    },

    async readVfsFile(path: string): Promise<Uint8Array> {
        const bytes = await invoke<number[]>("read_vfs_file", { path });
        return new Uint8Array(bytes);
    },

    async writeGeneratedAsset(path: string, bytes: Uint8Array): Promise<void> {
        return invoke("write_generated_asset", {
            path,
            bytes: Array.from(bytes),
        });
    },

    async saveProject(path: string): Promise<void> {
        return invoke("save_project", { path });
    },

    async openProject(path: string): Promise<OpenProjectResult> {
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

    async getTemplateSpec(
        templateId: string,
        variantId?: string | null,
    ): Promise<TemplateSpec> {
        return invoke("get_template_spec", {
            templateId,
            variantId: variantId ?? null,
        });
    },

    async loadTemplatePackageFiles(templateId: string): Promise<ProjectFile[]> {
        return invoke("load_template_package_files", { templateId });
    },

    async loadPackageFiles(name: string, version: string): Promise<ProjectFile[]> {
        return invoke("load_package_files", { name, version });
    },

    async documentDir(): Promise<string> {
        return tauriDocumentDir();
    },
};
