import { describe, expect, it } from "vitest";

import { EditorState, TextSelection } from "prosemirror-state";

import { bodySchema } from "./schema";

import { bodyPlugins } from "./plugins";

import {

    moveTableCellAdjacent,

    runAltTableCellNavigate,

    runBodyNavigate,

} from "./bodyTableCommands";

import { setTableEditing } from "./tableEditMode";

import { EditorView } from "prosemirror-view";



const tableDoc = () => {

    const cell = (text: string) =>

        bodySchema.nodes.table_cell.create(null, text ? [bodySchema.text(text)] : []);

    const row = (cells: ReturnType<typeof cell>[]) =>

        bodySchema.nodes.table_row.create(null, cells);

    const inner = bodySchema.nodes.table.create(null, [

        row([cell("a"), cell("b")]),

        row([cell("c"), cell("d")]),

    ]);

    const table = bodySchema.nodes.table_block.create(

        { elementId: "t1", columnSizes: ["1fr", "1fr"], extraFields: {} },

        [inner],

    );

    return bodySchema.nodes.doc.create(null, [table]);

};



const cellStart = (doc: ReturnType<typeof tableDoc>, text: string): number => {

    let start = 0;

    doc.descendants((node, pos) => {

        if (node.type.name === "table_cell" && node.textContent === text) {

            start = pos + 1;

        }

    });

    return start;

};



const stateInCell = (doc: ReturnType<typeof tableDoc>, cellText: string) => {

    let state = EditorState.create({ doc, plugins: bodyPlugins() });

    return state.apply(

        setTableEditing(

            state.tr.setSelection(TextSelection.create(doc, cellStart(doc, cellText))),

            "t1",

            true,

        ),

    );

};



const cellTextAtSelection = (state: EditorState): string =>

    state.selection.$head.parent.textContent;



describe("moveTableCellAdjacent", () => {

    it("moves right to the neighboring cell", () => {

        const doc = tableDoc();

        let state = stateInCell(doc, "a");

        moveTableCellAdjacent("horiz", 1)(state, (tr) => {

            state = state.apply(tr);

        });

        expect(cellTextAtSelection(state)).toBe("b");

    });



    it("moves down to the cell below", () => {

        const doc = tableDoc();

        let state = stateInCell(doc, "a");

        moveTableCellAdjacent("vert", 1)(state, (tr) => {

            state = state.apply(tr);

        });

        expect(cellTextAtSelection(state)).toBe("c");

    });



    it("moves up to the cell above", () => {

        const doc = tableDoc();

        let state = stateInCell(doc, "c");

        moveTableCellAdjacent("vert", -1)(state, (tr) => {

            state = state.apply(tr);

        });

        expect(cellTextAtSelection(state)).toBe("a");

    });



    it("moves left to the neighboring cell", () => {

        const doc = tableDoc();

        let state = stateInCell(doc, "b");

        moveTableCellAdjacent("horiz", -1)(state, (tr) => {

            state = state.apply(tr);

        });

        expect(cellTextAtSelection(state)).toBe("a");

    });



    it("does not wrap past the last column", () => {

        const doc = tableDoc();

        let state = stateInCell(doc, "b");

        const handled = moveTableCellAdjacent("horiz", 1)(state, () => undefined);

        expect(handled).toBe(false);

        expect(cellTextAtSelection(state)).toBe("b");

    });



    it("does not wrap past the last row", () => {

        const doc = tableDoc();

        let state = stateInCell(doc, "d");

        const handled = moveTableCellAdjacent("vert", 1)(state, () => undefined);

        expect(handled).toBe(false);

        expect(cellTextAtSelection(state)).toBe("d");

    });

});



const editorView = (state: EditorState): { view: EditorView; getState: () => EditorState } => {

    let current = state;

    const mount = document.createElement("div");

    const view = new EditorView(mount, {

        state: current,

        dispatchTransaction(tr) {

            current = current.apply(tr);

            view.updateState(current);

        },

    });

    return { view, getState: () => current };

};



describe("runBodyNavigate in table", () => {

    it("moves the caret within the cell when not at an edge", () => {

        const cell = (text: string) =>

            bodySchema.nodes.table_cell.create(null, [bodySchema.text(text)]);

        const row = (cells: ReturnType<typeof cell>[]) =>

            bodySchema.nodes.table_row.create(null, cells);

        const inner = bodySchema.nodes.table.create(null, [

            row([cell("hello"), cell("z")]),

            row([cell("c"), cell("d")]),

        ]);

        const table = bodySchema.nodes.table_block.create(

            { elementId: "t1", columnSizes: ["1fr", "1fr"], extraFields: {} },

            [inner],

        );

        const doc = bodySchema.nodes.doc.create(null, [table]);

        const start = cellStart(doc, "hello") + 2;

        let state = stateInCell(doc, "hello");

        state = state.apply(state.tr.setSelection(TextSelection.create(doc, start)));

        const { view, getState } = editorView(state);

        const handled = runBodyNavigate(view, "right");

        expect(handled).toBe(true);

        expect(cellTextAtSelection(getState())).toBe("hello");

        expect(getState().selection.$head.parentOffset).toBe(3);

        view.destroy();

    });



    it("crosses to the next cell on a plain arrow at the cell edge", () => {

        const doc = tableDoc();

        let end = 0;

        doc.descendants((node, pos) => {

            if (node.type.name === "table_cell" && node.textContent === "a") {

                end = pos + node.nodeSize - 1;

            }

        });

        let state = stateInCell(doc, "a");

        state = state.apply(state.tr.setSelection(TextSelection.create(doc, end)));

        const { view, getState } = editorView(state);

        const handled = runBodyNavigate(view, "right");

        expect(handled).toBe(true);

        expect(cellTextAtSelection(getState())).toBe("b");

        view.destroy();

    });

});



describe("runAltTableCellNavigate", () => {

    it("moves down on Alt+Down", () => {

        const doc = tableDoc();

        const { view, getState } = editorView(stateInCell(doc, "b"));

        expect(runAltTableCellNavigate(view, "ArrowDown")).toBe(true);

        expect(cellTextAtSelection(getState())).toBe("d");

        view.destroy();

    });



    it("does not wrap on Alt+Right from the last column", () => {

        const doc = tableDoc();

        const { view, getState } = editorView(stateInCell(doc, "b"));

        expect(runAltTableCellNavigate(view, "ArrowRight")).toBe(false);

        expect(cellTextAtSelection(getState())).toBe("b");

        view.destroy();

    });

});


