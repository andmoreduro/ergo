import { describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { bodySchema } from "./schema";
import { readActiveTextMarks } from "./textMarkState";

describe("readActiveTextMarks", () => {
    const doc = bodySchema.nodes.doc.create(null, [
        bodySchema.nodes.paragraph.create(
            { elementId: "p1" },
            [
                bodySchema.text("plain"),
                bodySchema.text("bold", [bodySchema.marks.strong.create()]),
            ],
        ),
    ]);

    it("detects stored marks at an empty selection", () => {
        const state = EditorState.create({
            doc,
            selection: TextSelection.create(doc, 2),
        });
        const marked = state.apply(
            state.tr.addStoredMark(bodySchema.marks.em.create()),
        );
        expect(readActiveTextMarks(marked)).toEqual({
            bold: false,
            italic: true,
            underline: false,
        });
    });

    it("detects marks under the caret and across a range", () => {
        const inBold = EditorState.create({
            doc,
            selection: TextSelection.create(doc, 7),
        });
        expect(readActiveTextMarks(inBold).bold).toBe(true);

        const plainOnly = EditorState.create({
            doc,
            selection: TextSelection.create(doc, 1, 6),
        });
        expect(readActiveTextMarks(plainOnly)).toEqual({
            bold: false,
            italic: false,
            underline: false,
        });
    });
});
