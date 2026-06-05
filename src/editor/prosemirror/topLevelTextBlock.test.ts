import { describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { bodySchema } from "./schema";
import { richTextToInlineNodes } from "./astBridge";
import { createRichText } from "../../state/ast/defaults";
import { topLevelTextBlockAtSelection } from "./topLevelTextBlock";

const docWithBlocks = () => {
    const paragraph = bodySchema.nodes.paragraph.create(
        { elementId: "p1" },
        richTextToInlineNodes(bodySchema, [createRichText("Body")]),
    );
    const heading = bodySchema.nodes.heading.create(
        { elementId: "h1", level: 2 },
        richTextToInlineNodes(bodySchema, [createRichText("Title")]),
    );
    const list = bodySchema.nodes.list.create({ elementId: "l1", ordered: false }, [
        bodySchema.nodes.list_item.create(null, [
            bodySchema.nodes.paragraph.create(
                { elementId: "" },
                richTextToInlineNodes(bodySchema, [createRichText("Item")]),
            ),
        ]),
    ]);
    return bodySchema.nodes.doc.create(null, [paragraph, heading, list]);
};

describe("topLevelTextBlockAtSelection", () => {
    it("detects a top-level paragraph", () => {
        const doc = docWithBlocks();
        const state = EditorState.create({
            schema: bodySchema,
            doc,
            selection: TextSelection.create(doc, 2),
        });
        expect(topLevelTextBlockAtSelection(state)).toEqual({
            kind: "paragraph",
            elementId: "p1",
        });
    });

    it("detects a top-level heading with level", () => {
        const doc = docWithBlocks();
        const pos = doc.child(0).nodeSize + 2;
        const state = EditorState.create({
            schema: bodySchema,
            doc,
            selection: TextSelection.create(doc, pos),
        });
        expect(topLevelTextBlockAtSelection(state)).toEqual({
            kind: "heading",
            elementId: "h1",
            level: 2,
        });
    });

    it("ignores paragraphs inside list items", () => {
        const doc = docWithBlocks();
        const listStart =
            doc.child(0).nodeSize + doc.child(1).nodeSize + 3;
        const state = EditorState.create({
            schema: bodySchema,
            doc,
            selection: TextSelection.create(doc, listStart),
        });
        expect(topLevelTextBlockAtSelection(state)).toBeNull();
    });
});
