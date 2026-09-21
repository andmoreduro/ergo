import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useEffect, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NodeSelection } from "prosemirror-state";
import { ActionContextProvider, ActionRuntimeProvider } from "../../../actions/runtime";
import { EditorNavigationProvider } from "../../../editor/EditorNavigationContext";
import { useFieldNavigation } from "../../../editor/useFieldNavigation";
import { isBlockEditing } from "../../../editor/prosemirror/blockEditMode";
import { getActiveBodyView } from "../../../editor/prosemirror/activeView";
import { SettingsProvider } from "../../../settings/SettingsProvider";
import { DocumentProvider, useDocumentActions } from "../../../state/DocumentContext";
import { EditorFieldRegistryProvider } from "../../../state/EditorFieldRegistry";
import { TemplateSpecProvider } from "../../../state/TemplateSpecContext";
import {
    createDiagram,
    createDocumentAST,
    createParagraph,
} from "../../../state/ast/defaults";
import type { DocumentAST } from "../../../bindings/DocumentAST";
import { ProseMirrorBodyEditor } from "./ProseMirrorBodyEditor";

vi.mock("../../../api/tauri", () => ({
    TauriApi: {
        resolveKeyEvent: vi.fn().mockResolvedValue({ status: "noMatch" }),
        resetKeySequence: vi.fn(),
        loadGlobalSettings: vi.fn().mockResolvedValue({}),
        loadKeymapSettings: vi.fn().mockResolvedValue({}),
        saveGlobalSettings: vi
            .fn()
            .mockResolvedValue({ translation_server_error: null }),
        saveKeymapSettings: vi.fn().mockResolvedValue(undefined),
        validateKeymapSettings: vi
            .fn()
            .mockResolvedValue({ conflicts: [], errors: [] }),
        getTemplateSpec: vi.fn().mockResolvedValue(null),
        getActionCatalog: vi.fn().mockResolvedValue([]),
        readVfsFile: vi.fn(),
        importResourceFile: vi.fn(),
        writeGeneratedAsset: vi.fn(),
    },
}));

vi.mock("../../../editor/diagram/useDiagramMermaidAsset", () => ({
    useDiagramMermaidAsset: () => ({ previewUrl: null }),
}));

const NavProvider = ({ children }: { children: ReactNode }) => {
    const nav = useFieldNavigation(null, null);
    return createElement(EditorNavigationProvider, { value: nav }, children);
};

const Loaded = ({ ast, children }: { ast: DocumentAST; children: ReactNode }) => {
    const { dispatch } = useDocumentActions();
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
        dispatch({ type: "LOAD_DOCUMENT", payload: { ast } });
        setLoaded(true);
    }, [ast, dispatch]);
    return loaded ? createElement(ActionRuntimeProvider, null, children) : null;
};

const keydown = (target: Element, init: KeyboardEventInit) => {
    const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
    });
    target.dispatchEvent(event);
    return event;
};

const flush = () => act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
});

const describeActive = () => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) {
        return String(active);
    }
    return `${active.tagName.toLowerCase()} field=${active.dataset.editorFieldId ?? "-"} class=${active.className}`;
};

describe("diagram block fields via the real body editor", () => {
    let root: Root | null = null;
    let host: HTMLElement | null = null;

    afterEach(async () => {
        if (root) {
            const current = root;
            await act(async () => current.unmount());
        }
        host?.remove();
        root = null;
        host = null;
        vi.clearAllMocks();
    });

    it("Tab enters the diagram, Tab moves to the caption, Shift+Tab returns to the source", async () => {
        const ast = createDocumentAST("none");
        const section = ast.sections[0];
        if (section.type !== "Content") {
            throw new Error("expected a content section");
        }
        const diagram = createDiagram("diag1");
        section.elements.push(createParagraph("intro", "p1"), diagram);

        host = document.createElement("div");
        document.body.appendChild(host);
        root = createRoot(host);
        await act(async () => {
            root!.render(
                createElement(
                    SettingsProvider,
                    null,
                    createElement(
                        DocumentProvider,
                        null,
                        createElement(
                            Loaded,
                            { ast },
                            createElement(
                                TemplateSpecProvider,
                                { templateId: "none" },
                                createElement(
                                    EditorFieldRegistryProvider,
                                    null,
                                    createElement(
                                        NavProvider,
                                        null,
                                        createElement(
                                            ActionContextProvider,
                                            { id: "editor", contexts: ["editor"] },
                                            createElement(ProseMirrorBodyEditor, {
                                                sectionId: section.id,
                                            }),
                                        ),
                                    ),
                                ),
                            ),
                        ),
                    ),
                ),
            );
        });
        await flush();

        const view = getActiveBodyView();
        expect(view).not.toBeNull();
        let blockPos = -1;
        view!.state.doc.forEach((node, offset) => {
            if (node.type.name === "diagram") {
                blockPos = offset;
            }
        });
        expect(blockPos).toBeGreaterThanOrEqual(0);

        await act(async () => {
            view!.dispatch(
                view!.state.tr.setSelection(
                    NodeSelection.create(view!.state.doc, blockPos),
                ),
            );
            view!.focus();
        });
        await flush();
        expect(view!.hasFocus()).toBe(true);

        const tab1 = keydown(view!.dom, { key: "Tab" });
        await flush();
        expect(tab1.defaultPrevented).toBe(true);
        expect(isBlockEditing(view!.state, "diag1")).toBe(true);
        const source = document.activeElement;
        expect(
            source instanceof HTMLTextAreaElement,
            `after Tab #1 active=${describeActive()}`,
        ).toBe(true);

        const tab2 = keydown(source!, { key: "Tab" });
        await flush();
        expect(tab2.defaultPrevented).toBe(true);
        const caption = document.activeElement;
        expect(
            caption instanceof HTMLElement && caption.getAttribute("role") === "textbox",
            `after Tab #2 active=${describeActive()}`,
        ).toBe(true);

        const shiftTab = keydown(caption!, { key: "Tab", shiftKey: true });
        await flush();
        expect(shiftTab.defaultPrevented).toBe(true);
        expect(document.activeElement, `after Shift+Tab active=${describeActive()}`).toBe(source);
        expect(isBlockEditing(view!.state, "diag1")).toBe(true);
        expect(view!.hasFocus(), "ProseMirror root must not take focus").toBe(false);

        // Anything that hands focus back to the ProseMirror root while the
        // block is being edited (preview click, programmatic node selection)
        // ends edit mode in the same tick: the block is a locked whole again.
        await act(async () => {
            view!.dispatch(
                view!.state.tr.setSelection(
                    NodeSelection.create(view!.state.doc, blockPos),
                ),
            );
            view!.focus();
        });
        await flush();
        expect(isBlockEditing(view!.state, "diag1")).toBe(false);
        expect(view!.state.selection instanceof NodeSelection).toBe(true);
        const hostEl = document.querySelector('[data-pm-nodeview="diagram"]')!;
        expect(hostEl.classList.contains("ergo-block-object--selected")).toBe(true);
        expect(hostEl.classList.contains("ergo-block-object--editing")).toBe(false);
    });

    it("programmatic focus on a block field opens the block and focuses that field", async () => {
        const ast = createDocumentAST("none");
        const section = ast.sections[0];
        if (section.type !== "Content") {
            throw new Error("expected a content section");
        }
        const diagram = createDiagram("diag2");
        section.elements.push(createParagraph("intro", "p1"), diagram);

        let setFocus: ((focus: Parameters<ReturnType<typeof useDocumentActions>["setDocumentFocus"]>[0]) => void) | null = null;
        const FocusProbe = () => {
            const { setDocumentFocus } = useDocumentActions();
            setFocus = setDocumentFocus;
            return null;
        };

        host = document.createElement("div");
        document.body.appendChild(host);
        root = createRoot(host);
        await act(async () => {
            root!.render(
                createElement(
                    SettingsProvider,
                    null,
                    createElement(
                        DocumentProvider,
                        null,
                        createElement(
                            Loaded,
                            { ast },
                            createElement(FocusProbe),
                            createElement(
                                TemplateSpecProvider,
                                { templateId: "none" },
                                createElement(
                                    EditorFieldRegistryProvider,
                                    null,
                                    createElement(
                                        NavProvider,
                                        null,
                                        createElement(
                                            ActionContextProvider,
                                            { id: "editor", contexts: ["editor"] },
                                            createElement(ProseMirrorBodyEditor, {
                                                sectionId: section.id,
                                            }),
                                        ),
                                    ),
                                ),
                            ),
                        ),
                    ),
                ),
            );
        });
        await flush();

        const view = getActiveBodyView()!;
        await act(async () => {
            setFocus!({
                elementId: "diag2",
                fieldId: "diag2:caption",
                caretUtf16Offset: 0,
                sourceRevision: null,
                anchorPageNumber: null,
                forcePreviewScroll: false,
                focusSource: "programmatic",
            });
        });
        await flush();

        expect(isBlockEditing(view.state, "diag2")).toBe(true);
        const active = document.activeElement as HTMLElement | null;
        expect(active?.dataset.editorFieldId, `active=${describeActive()}`).toBe("diag2:caption");
        expect(view.hasFocus()).toBe(false);
    });
});
