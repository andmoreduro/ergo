import { describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { toggleMark } from "prosemirror-commands";
import type { ContentSection } from "../../bindings/ContentSection";
import { createRichText } from "../../state/ast/defaults";
import { paragraphHasUnderline } from "./sectionReconcileGuard";
import {
    docToElements,
    nodeToElement,
    sectionToDoc,
} from "./astBridge";
import { bodySchema } from "./schema";
import { bodyPlugins } from "./plugins";
import { rangeSignificantlyEqual } from "./sectionDiff";

describe("underline revert diagnostics", () => {
    const sectionWithoutUnderline = (): ContentSection =>
        ({
            id: "s1",
            is_optional: false,
            elements: [
                {
                    type: "Paragraph",
                    id: "p1",
                    content: [createRichText("hello")],
                },
            ],
        }) as ContentSection;

    it("stale sectionToDoc drops underline that PM already has", () => {
        const section = sectionWithoutUnderline();
        const doc = sectionToDoc(bodySchema, section);
        const state = EditorState.create({ doc, plugins: bodyPlugins() });
        const mark = bodySchema.marks.underline;
        const from = 1;
        const to = 1 + "hello".length;
        const tr = state.tr.addMark(from, to, mark.create());
        const withUnderline = state.apply(tr);
        expect(
            paragraphHasUnderline(docToElements(withUnderline.doc)),
        ).toBe(true);

        const staleTarget = sectionToDoc(bodySchema, section);
        const reconciled = withUnderline.apply(
            withUnderline.tr.replaceWith(
                0,
                withUnderline.doc.content.size,
                staleTarget,
            ),
        );
        expect(
            paragraphHasUnderline(docToElements(reconciled.doc)),
        ).toBe(false);
    });

    it("mark-only toggle is compile-significant", () => {
        const section = sectionWithoutUnderline();
        const doc = sectionToDoc(bodySchema, section);
        const state = EditorState.create({ doc, plugins: bodyPlugins() });
        const from = 1;
        const to = 1 + "hello".length;
        const nextState = state.apply(
            state.tr.addMark(from, to, bodySchema.marks.underline.create()),
        );
        const prevElements = section.elements;
        const nextElements = docToElements(nextState.doc);
        expect(
            rangeSignificantlyEqual(prevElements, nextElements, 0, 0),
        ).toBe(false);
        const el = nodeToElement(nextState.doc.child(0));
        expect(el.type).toBe("Paragraph");
        if (el.type === "Paragraph") {
            expect(el.content.some((s) => s.underline === true)).toBe(true);
        }
    });

    it("second toggleMark removes underline", () => {
        const section = sectionWithoutUnderline();
        const doc = sectionToDoc(bodySchema, section);
        const state = EditorState.create({ doc, plugins: bodyPlugins() });
        const mount = document.createElement("div");
        document.body.appendChild(mount);
        const view = new EditorView(mount, { state });
        try {
            const from = 1;
            const to = 1 + "hello".length;
            view.dispatch(
                view.state.tr.setSelection(
                    TextSelection.create(view.state.doc, from, to),
                ),
            );
            toggleMark(bodySchema.marks.underline)(view.state, view.dispatch);
            expect(paragraphHasUnderline(docToElements(view.state.doc))).toBe(
                true,
            );
            toggleMark(bodySchema.marks.underline)(view.state, view.dispatch);
            expect(paragraphHasUnderline(docToElements(view.state.doc))).toBe(
                false,
            );
        } finally {
            view.destroy();
            mount.remove();
        }
    });

    it("ProseMirror does NOT handle Mod-u (action runtime is the sole path)", () => {
        // Underline must flow only through the action runtime
        // (editor::Underline -> applyBodyMark), exactly like bold/italic.
        // A PM Mod-u keymap here would toggle a second time and revert the mark.
        const section = sectionWithoutUnderline();
        const doc = sectionToDoc(bodySchema, section);
        const mount = document.createElement("div");
        document.body.appendChild(mount);
        const view = new EditorView(mount, {
            state: EditorState.create({ doc, plugins: bodyPlugins() }),
        });
        try {
            const from = 1;
            const to = 1 + "hello".length;
            view.dispatch(
                view.state.tr.setSelection(
                    TextSelection.create(view.state.doc, from, to),
                ),
            );
            view.focus();
            const event = new KeyboardEvent("keydown", {
                key: "u",
                code: "KeyU",
                ctrlKey: true,
                bubbles: true,
                cancelable: true,
            });
            view.dom.dispatchEvent(event);
            expect(event.defaultPrevented).toBe(false);
            expect(paragraphHasUnderline(docToElements(view.state.doc))).toBe(
                false,
            );
        } finally {
            view.destroy();
            mount.remove();
        }
    });
});
