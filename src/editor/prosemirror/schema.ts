import { Schema, type NodeSpec, type MarkSpec } from "prosemirror-model";
import { tableNodes } from "prosemirror-tables";

/**
 * ProseMirror schema for the document body editor.
 *
 * The schema mirrors the Érgo content AST: text-flow elements (paragraph,
 * heading, quote, list/enumeration) hold inline content, while block objects
 * (equation, figure, diagram, custom) are atoms whose full `DocumentElement` is
 * carried in the `element` attr and edited through an embedded NodeView. Tables
 * use the official `prosemirror-tables` nodes so cells can be merged/selected.
 *
 * Inline content carries marks (strong/em/underline) plus two inline atoms:
 * `reference` (a citation chip, zero width in field-offset terms) and
 * `inlineEquation` (width = its `source` length). Keeping these widths aligned
 * with the Rust source map is what preserves preview caret sync — see
 * `astBridge.ts` `fieldCaretOffsetFromNode`.
 */

// Cells are plain text: the `TableCell` AST stores a `String`, so allowing marks
// or inline atoms (reference / inline equation) here would silently drop them on
// commit and break the field-offset contract. Rich cells need a `TableCell` AST
// change first — see `astBridge.ts` `nodeToTable`.
const tNodes = tableNodes({
    tableGroup: "block",
    cellContent: "text*",
    cellAttributes: {},
});

const baseNodes: Record<string, NodeSpec> = {
    doc: { content: "block+" },

    paragraph: {
        group: "block",
        content: "inline*",
        attrs: { elementId: { default: "" } },
        parseDOM: [{ tag: "p" }],
        toDOM: (node) => ["p", { "data-element-id": node.attrs.elementId }, 0],
    },

    heading: {
        group: "block",
        content: "inline*",
        defining: true,
        attrs: { elementId: { default: "" }, level: { default: 1 } },
        parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
            tag: `h${level}`,
            attrs: { level },
        })),
        toDOM: (node) => [
            `h${node.attrs.level}`,
            { "data-element-id": node.attrs.elementId },
            0,
        ],
    },

    quote: {
        group: "block",
        content: "inline*",
        defining: true,
        attrs: { elementId: { default: "" } },
        parseDOM: [{ tag: "blockquote" }],
        toDOM: (node) => [
            "blockquote",
            { "data-element-id": node.attrs.elementId },
            0,
        ],
    },

    list: {
        group: "block",
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
        content: "inline*",
        defining: true,
        parseDOM: [{ tag: "li" }],
        toDOM: () => ["li", 0],
    },

    text: { group: "inline" },

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

const atomBlock = (kind: string): NodeSpec => ({
    group: "block",
    atom: true,
    selectable: true,
    isolating: true,
    attrs: {
        element: { default: null },
        elementId: { default: "" },
    },
    toDOM: (node) => [
        "div",
        {
            "data-element-kind": kind,
            "data-element-id":
                (node.attrs.elementId as string) ||
                node.attrs.element?.id ||
                "",
        },
        kind,
    ],
});

const blockObjectNodes: Record<string, NodeSpec> = {
    equation: atomBlock("Equation"),
    figure: atomBlock("Figure"),
    diagram: atomBlock("Diagram"),
    custom: atomBlock("Custom"),
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

export const bodySchema = new Schema({
    nodes: {
        ...baseNodes,
        ...blockObjectNodes,
        table_block: {
            group: "block",
            content: "table",
            isolating: true,
            attrs: {
                elementId: { default: "" },
                columnSizes: { default: [] },
                extraFields: { default: {} },
            },
            parseDOM: [{ tag: "div.ergo-table-block" }],
            toDOM: (node) => [
                "div",
                {
                    class: "ergo-table-block",
                    "data-element-id": node.attrs.elementId,
                },
                0,
            ],
        },
        table: {
            ...tNodes.table,
            attrs: {
                ...(tNodes.table.attrs ?? {}),
            },
        },
        table_row: tNodes.table_row,
        table_cell: tNodes.table_cell,
        table_header: tNodes.table_header,
    },
    marks,
});

export type BodySchema = typeof bodySchema;

/** Inline atom node type names whose field-offset width differs from PM size 1. */
export const REFERENCE_NODE = "reference";
export const INLINE_EQUATION_NODE = "inlineEquation";

/** Node type names that hold a single rich-text field as inline content. */
export const TEXT_FIELD_NODES = new Set([
    "paragraph",
    "heading",
    "quote",
    "list_item",
    "table_cell",
    "table_header",
]);

/** Block atom node type names backed by an embedded element editor. */
export const ATOM_BLOCK_NODES = new Set(["equation", "figure", "diagram", "custom"]);

/** Isolating wrapper; the inner `table` is edited only in table edit mode. */
export const TABLE_BLOCK_NODE = "table_block";
