import { Schema, type NodeSpec, type MarkSpec } from "prosemirror-model";
import { tableNodes } from "prosemirror-tables";

const tNodes = tableNodes({
    tableGroup: "tableblock",
    cellContent: "inline*",
    cellAttributes: {},
});

const inlineNodes: Record<string, NodeSpec> = {
    text: { group: "inline" },

    hard_break: {
        inline: true,
        group: "inline",
        selectable: false,
        parseDOM: [{ tag: "br" }],
        toDOM: () => ["br"],
    },

    reference: {
        group: "inline",
        inline: true,
        atom: true,
        selectable: false,
        attrs: { referenceId: { default: "" }, label: { default: "" } },
        parseDOM: [
            {
                tag: "span[data-reference-id]",
                getAttrs: (dom) => ({
                    referenceId:
                        (dom as HTMLElement).getAttribute("data-reference-id") ?? "",
                    label:
                        (dom as HTMLElement).getAttribute("data-reference-label") ??
                        (dom as HTMLElement).textContent ??
                        "",
                }),
            },
        ],
        toDOM: (node) => [
            "span",
            {
                class: "ergo-ref-chip",
                contenteditable: "false",
                "data-reference-id": node.attrs.referenceId,
                "data-reference-label": node.attrs.label,
            },
            node.attrs.label,
        ],
    },

    inlineEquation: {
        group: "inline",
        inline: true,
        atom: true,
        attrs: {
            source: { default: "" },
            syntax: { default: "typst" },
            label: { default: "" },
        },
        parseDOM: [
            {
                tag: "span[data-inline-equation-source]",
                getAttrs: (dom) => {
                    const el = dom as HTMLElement;
                    const source = el.getAttribute("data-inline-equation-source") ?? "";
                    return {
                        source,
                        syntax:
                            el.getAttribute("data-inline-equation-syntax") === "latex"
                                ? "latex"
                                : "typst",
                        label: el.textContent ?? source,
                    };
                },
            },
        ],
        toDOM: (node) => [
            "span",
            {
                contenteditable: "false",
                "data-inline-equation-source": node.attrs.source,
                "data-inline-equation-syntax": node.attrs.syntax,
            },
            node.attrs.label || node.attrs.source,
        ],
    },
};

const marks: Record<string, MarkSpec> = {
    strong: {
        parseDOM: [
            { tag: "strong" },
            { tag: "b" },
            { style: "font-weight=bold" },
            {
                style: "font-weight",
                getAttrs: (value) =>
                    /^(bold(er)?|[5-9]\d{2,})$/.test(value as string) && null,
            },
        ],
        toDOM: () => ["strong", 0],
    },
    em: {
        parseDOM: [{ tag: "em" }, { tag: "i" }, { style: "font-style=italic" }],
        toDOM: () => ["em", 0],
    },
    underline: {
        parseDOM: [
            { tag: "u" },
            { style: "text-decoration-line=underline" },
            { style: "text-decoration=underline" },
        ],
        toDOM: () => ["u", 0],
    },
};

export const tableSchema = new Schema({
    nodes: {
        doc: { content: "table" },
        ...inlineNodes,
        table: tNodes.table,
        table_row: tNodes.table_row,
        table_cell: tNodes.table_cell,
        table_header: tNodes.table_header,
    },
    marks,
});

export type TableSchema = typeof tableSchema;

/** Cell content expression used by `tableEditing` from prosemirror-tables. */
export const tableCellContentExpr = "inline*";
