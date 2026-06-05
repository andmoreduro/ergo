import { Schema, type NodeSpec, type MarkSpec } from "prosemirror-model";
import { tableNodes } from "prosemirror-tables";

const tNodes = tableNodes({
    tableGroup: "tableblock",
    cellContent: "cellblock+",
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

    inlineQuote: {
        group: "inline",
        inline: true,
        atom: true,
        attrs: {
            source: { default: "" },
            label: { default: "" },
            attributionText: { default: "" },
            attributionReferenceId: { default: "" },
        },
        parseDOM: [
            {
                tag: "span[data-inline-quote-source]",
                getAttrs: (dom) => {
                    const el = dom as HTMLElement;
                    const source = el.getAttribute("data-inline-quote-source") ?? "";
                    return {
                        source,
                        label: el.textContent ?? source,
                        attributionText:
                            el.getAttribute("data-inline-quote-attribution-text") ?? "",
                        attributionReferenceId:
                            el.getAttribute("data-inline-quote-attribution-reference-id") ??
                            "",
                    };
                },
            },
        ],
        toDOM: (node) => [
            "span",
            {
                contenteditable: "false",
                "data-inline-quote-source": node.attrs.source,
                "data-inline-quote-attribution-text": node.attrs.attributionText,
                "data-inline-quote-attribution-reference-id":
                    node.attrs.attributionReferenceId,
            },
            node.attrs.label || node.attrs.source,
        ],
    },
};

const cellBlockNodes: Record<string, NodeSpec> = {
    paragraph: {
        group: "cellblock",
        content: "inline*",
        attrs: { elementId: { default: "" } },
        parseDOM: [{ tag: "p" }],
        toDOM: (node) => ["p", { "data-element-id": node.attrs.elementId }, 0],
    },

    quote: {
        group: "cellblock",
        content: "inline*",
        defining: true,
        attrs: {
            elementId: { default: "" },
            attributionText: { default: "" },
            attributionReferenceId: { default: "" },
        },
        parseDOM: [{ tag: "blockquote" }],
        toDOM: (node) => [
            "blockquote",
            {
                "data-element-id": node.attrs.elementId,
                "data-quote-attribution-text": node.attrs.attributionText,
                "data-quote-attribution-reference-id":
                    node.attrs.attributionReferenceId,
            },
            0,
        ],
    },

    list: {
        group: "cellblock",
        content: "list_item+",
        attrs: { elementId: { default: "" }, ordered: { default: false } },
        parseDOM: [
            { tag: "ul", attrs: { ordered: false } },
            { tag: "ol", attrs: { ordered: true } },
        ],
        toDOM: (node) => [
            node.attrs.ordered ? "ol" : "ul",
            { "data-element-id": node.attrs.elementId },
            0,
        ],
    },

    list_item: {
        content: "paragraph list?",
        defining: true,
        parseDOM: [{ tag: "li" }],
        toDOM: () => ["li", 0],
    },

    equation: {
        group: "cellblock",
        atom: true,
        selectable: true,
        attrs: {
            element: { default: null },
            elementId: { default: "" },
        },
        toDOM: (node) => [
            "div",
            {
                "data-element-kind": "Equation",
                "data-element-id":
                    (node.attrs.elementId as string) ||
                    node.attrs.element?.id ||
                    "",
            },
            "Equation",
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
        toDOM: () => [
            "span",
            { style: "text-decoration: underline" },
            0,
        ],
    },
};

export const tableSchema = new Schema({
    nodes: {
        doc: { content: "table" },
        ...inlineNodes,
        ...cellBlockNodes,
        table: tNodes.table,
        table_row: tNodes.table_row,
        table_cell: tNodes.table_cell,
        table_header: tNodes.table_header,
    },
    marks,
});

export type TableSchema = typeof tableSchema;

/** Cell content expression used by `tableEditing` from prosemirror-tables. */
export const tableCellContentExpr = "cellblock+";
