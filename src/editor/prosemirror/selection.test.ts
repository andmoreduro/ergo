import { describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import type { ContentSection } from "../../bindings/ContentSection";
import type { RichText } from "../../bindings/RichText";
import { createListItem, createRichText } from "../../state/ast/defaults";
import { sectionToDoc } from "./astBridge";
import { bodySchema } from "./schema";
import {
    type BodyFocusTarget,
    focusTargetFromState,
    selectionForFocusTarget,
} from "./selection";

const reference = (label: string, id: string): RichText => ({
    ...createRichText(label),
    kind: "reference",
    reference_id: id,
});

const stateFor = (section: ContentSection) =>
    EditorState.create({ doc: sectionToDoc(bodySchema, section) });

/** target → selection → target must be a fixed point. */
const expectFixedPoint = (section: ContentSection, target: BodyFocusTarget) => {
    const state = stateFor(section);
    const selection = selectionForFocusTarget(state.doc, target);
    expect(selection, `no selection for ${JSON.stringify(target)}`).not.toBeNull();
    const next = state.apply(state.tr.setSelection(selection!));
    expect(focusTargetFromState(next)).toEqual(target);
};

describe("selection ↔ focus target", () => {
    const section: ContentSection = {
        id: "s1",
        is_optional: false,
        elements: [
            { type: "Heading", id: "h1", level: 1, content: [createRichText("Title")] },
            {
                type: "Paragraph",
                id: "p1",
                content: [
                    createRichText("see "),
                    reference("Doe2020", "ref-1"),
                    createRichText(" here"),
                ],
            },
            {
                type: "List",
                id: "l1",
                items: [createListItem("first"), createListItem("second")],
            },
        ],
    };

    it("round-trips a paragraph caret", () => {
        expectFixedPoint(section, {
            elementId: "p1",
            fieldId: "p1:text",
            caretUtf16Offset: 2,
        });
    });

    it("round-trips a caret after a zero-width reference", () => {
        // "see " = 4, reference = 0, so offset 4 sits just after the chip
        expectFixedPoint(section, {
            elementId: "p1",
            fieldId: "p1:text",
            caretUtf16Offset: 4,
        });
    });

    it("round-trips a heading caret", () => {
        expectFixedPoint(section, {
            elementId: "h1",
            fieldId: "h1:text",
            caretUtf16Offset: 5,
        });
    });

    it("round-trips a list item caret", () => {
        expectFixedPoint(section, {
            elementId: "l1",
            fieldId: "l1:item:1",
            caretUtf16Offset: 3,
        });
    });

    it("round-trips a quote caret", () => {
        const quoteSection: ContentSection = {
            id: "s1",
            is_optional: false,
            elements: [
                {
                    type: "Quote",
                    id: "q1",
                    content: [createRichText("quoted text")],
                },
            ],
        };
        expectFixedPoint(quoteSection, {
            elementId: "q1",
            fieldId: "q1:quote",
            caretUtf16Offset: 3,
        });
    });

    it("round-trips an atom block node selection", () => {
        const atomSection: ContentSection = {
            id: "s1",
            is_optional: false,
            elements: [
                {
                    type: "Equation",
                    id: "eq1",
                    latex_source: "x^2",
                    is_block: true,
                    syntax: "latex",
                },
            ],
        };
        expectFixedPoint(atomSection, {
            elementId: "eq1",
            fieldId: null,
            caretUtf16Offset: null,
        });
    });
});
