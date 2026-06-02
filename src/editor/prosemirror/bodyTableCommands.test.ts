import { describe, expect, it } from "vitest";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { createRichText, createTable } from "../../state/ast/defaults";
import { bodySchema } from "./schema";
import { blockEditModePlugin } from "./blockEditMode";
import {
    arrowTowardNextBlock,
    navigateAdjacentBlock,
} from "./bodyTableCommands";

const wrapTableElement = () => {
    const table = createTable(1, 2, "t1");
    if (table.type !== "Table") {
        throw new Error("expected table element");
    }
    table.cells[0][0].elements = [
        { type: "Paragraph", id: "cell-p", content: [createRichText("in table")] },
    ];
    return bodySchema.nodes.table_block.create({
        elementId: table.id,
        element: table,
    });
};

const docWithParagraphTableParagraph = () => {
    const table = wrapTableElement();
    const above = bodySchema.nodes.paragraph.create(
        { elementId: "p1", extraFields: {} },
        [bodySchema.text("above")],
    );
    const below = bodySchema.nodes.paragraph.create(
        { elementId: "p2", extraFields: {} },
        [bodySchema.text("below")],
    );
    return bodySchema.nodes.doc.create(null, [above, table, below]);
};

const docWithParagraphAndTable = () => {
    const table = wrapTableElement();
    const paragraph = bodySchema.nodes.paragraph.create(
        { elementId: "p1", extraFields: {} },
        [bodySchema.text("above")],
    );
    return bodySchema.nodes.doc.create(null, [paragraph, table]);
};

const tableBlockPos = (doc: ReturnType<typeof docWithParagraphAndTable>) => {
    let tablePos = -1;
    doc.forEach((node, offset) => {
        if (node.type.name === "table_block") {
            tablePos = offset;
        }
    });
    return tablePos;
};

describe("table block navigation", () => {
    it("selects the table block when moving down from the paragraph above", () => {
        const doc = docWithParagraphAndTable();
        const tablePos = tableBlockPos(doc);
        const paraEnd = tablePos - 2;
        let state = EditorState.create({
            doc,
            plugins: [blockEditModePlugin()],
            selection: TextSelection.create(doc, paraEnd),
        });
        const view = {
            endOfTextblock: (dir: string) => dir === "down",
        };
        arrowTowardNextBlock(1)(state, (tr) => {
            state = state.apply(tr);
        }, view as never);
        expect(state.selection).toBeInstanceOf(NodeSelection);
        expect(state.selection.from).toBe(tablePos);
        expect(
            state.selection instanceof NodeSelection
                ? state.selection.node.type.name
                : null,
        ).toBe("table_block");
    });

    it("moves down from a selected table block to the paragraph below", () => {
        const doc = docWithParagraphTableParagraph();
        const tablePos = tableBlockPos(doc);
        let state = EditorState.create({
            doc,
            plugins: [blockEditModePlugin()],
            selection: NodeSelection.create(doc, tablePos),
        });
        navigateAdjacentBlock(1)(state, (tr) => {
            state = state.apply(tr);
        });
        expect(state.selection).toBeInstanceOf(TextSelection);
        expect(state.selection.$head.parent.textContent).toBe("below");
    });

    it("selects the table block when moving up from the paragraph below", () => {
        const doc = docWithParagraphTableParagraph();
        const tablePos = tableBlockPos(doc);
        let belowStart = -1;
        doc.forEach((node, offset) => {
            if (node.type.name === "paragraph" && node.textContent === "below") {
                belowStart = offset + 1;
            }
        });
        let state = EditorState.create({
            doc,
            plugins: [blockEditModePlugin()],
            selection: TextSelection.create(doc, belowStart),
        });
        const view = { endOfTextblock: (dir: string) => dir === "up" };
        arrowTowardNextBlock(-1)(state, (tr) => {
            state = state.apply(tr);
        }, view as never);
        expect(state.selection).toBeInstanceOf(NodeSelection);
        expect(state.selection.from).toBe(tablePos);
    });

});
