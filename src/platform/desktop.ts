import { documentDir as tauriDocumentDir } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";

type CloseRequestEvent = {
    preventDefault: () => void;
};

type CloseRequestHandler = (
    event: CloseRequestEvent,
) => void | Promise<void>;

export interface DesktopPlatform {
    openProjectDialog: () => Promise<string | null>;
    saveProjectDialog: () => Promise<string | null>;
    chooseFolderDialog: (title: string) => Promise<string | null>;
    documentsDirectory: () => Promise<string>;
    onCloseRequested: (
        handler: CloseRequestHandler,
    ) => Promise<() => void>;
    closeCurrentWindow: () => Promise<void>;
}

const asSinglePath = (value: string | string[] | null): string | null =>
    typeof value === "string" ? value : null;

export const desktopPlatform: DesktopPlatform = {
    async openProjectDialog() {
        return asSinglePath(
            await open({
                multiple: false,
                filters: [{ name: "Érgo Project", extensions: ["ergproj"] }],
            }),
        );
    },

    async saveProjectDialog() {
        return asSinglePath(
            await save({
                filters: [{ name: "Érgo Project", extensions: ["ergproj"] }],
            }),
        );
    },

    async chooseFolderDialog(title) {
        return asSinglePath(
            await open({
                directory: true,
                multiple: false,
                title,
            }),
        );
    },

    async documentsDirectory() {
        return tauriDocumentDir();
    },

    async onCloseRequested(handler) {
        return getCurrentWindow().onCloseRequested(handler);
    },

    async closeCurrentWindow() {
        await getCurrentWindow().close();
    },
};
