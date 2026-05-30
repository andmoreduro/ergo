import { describe, expect, it } from "vitest";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { bodySchema } from "./schema";
import { bodyPlugins } from "./plugins";
import {
    arrowTowardNextBlock,
    enterTableFirstCell,
    navigateAdjacentBlock,
} from "./bodyTableCommands";
const wrapTable = (table: ReturnType<typeof bodySchema.nodes.table.create>) =>
    bodySchema.nodes.table_block.create(
        { elementId: "t1", columnSizes: ["1fr", "1fr"], extraFields: {} },
        [table],
    );

const tableOnly = (rows: ReturnType<typeof bodySchema.nodes.table_row.create>[]) =>
    bodySchema.nodes.table.create(null, rows);

const docWithParagraphTableParagraph = () => {
    const cell = (text: string) =>
        bodySchema.nodes.table_cell.create(null, text ? [bodySchema.text(text)] : []);
    const row = (cells: ReturnType<typeof cell>[]) =>
        bodySchema.nodes.table_row.create(null, cells);
    const table = wrapTable(
        tableOnly([row([cell("in table"), cell("")])]),
    );
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
    const cell = (text: string) =>
        bodySchema.nodes.table_cell.create(null, text ? [bodySchema.text(text)] : []);
    const row = (cells: ReturnType<typeof cell>[]) =>
        bodySchema.nodes.table_row.create(null, cells);
    const table = wrapTable(
        tableOnly([row([cell("in table"), cell("")])]),
    );
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
            plugins: bodyPlugins(),
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
            plugins: bodyPlugins(),
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
            plugins: bodyPlugins(),
            selection: TextSelection.create(doc, belowStart),
        });
        const view = { endOfTextblock: (dir: string) => dir === "up" };
        arrowTowardNextBlock(-1)(state, (tr) => {
            state = state.apply(tr);
        }, view as never);
        expect(state.selection).toBeInstanceOf(NodeSelection);
        expect(state.selection.from).toBe(tablePos);
    });

    it("enters the first cell only when the table block is selected", () => {
        const doc = docWithParagraphAndTable();
        const tablePos = tableBlockPos(doc);
        let state = EditorState.create({
            doc,
            plugins: bodyPlugins(),
            selection: NodeSelection.create(doc, tablePos),
        });
        enterTableFirstCell(state, (tr) => {
            state = state.apply(tr);
        });
        expect(state.selection).toBeInstanceOf(TextSelection);
        expect(state.selection.$from.parent.textContent).toBe("in table");
    });
});
