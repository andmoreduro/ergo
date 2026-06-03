import { describe, expect, it } from "vitest";
import { resolveBodyEditorInsertShortcut } from "./editorBodyShortcuts";

describe("resolveBodyEditorInsertShortcut", () => {
    it("maps Ctrl+Alt+Shift+digit to heading insert with level payload", () => {
        const invocation = resolveBodyEditorInsertShortcut({
            key: "!",
            code: "Digit4",
            ctrlKey: true,
            altKey: true,
            shiftKey: true,
        } as KeyboardEvent);

        expect(invocation).toEqual({
            id: "editor::InsertHeading",
            payload: { level: 4 },
        });
    });

    it("maps Ctrl+Alt+P to insert paragraph", () => {
        const invocation = resolveBodyEditorInsertShortcut({
            key: "p",
            code: "KeyP",
            ctrlKey: true,
            altKey: true,
            shiftKey: false,
        } as KeyboardEvent);

        expect(invocation?.id).toBe("editor::InsertParagraph");
    });
});
