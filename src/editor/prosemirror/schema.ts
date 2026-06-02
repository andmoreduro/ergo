import { Schema, type NodeSpec, type MarkSpec } from "prosemirror-model";

/**
 * ProseMirror schema for the document body editor.
 *
 * The schema mirrors the Érgo content AST: text-flow elements (paragraph,
 * heading, quote, list/enumeration) hold inline content, while block objects
 * (equation, figure, diagram, custom) are atoms whose full `DocumentElement` is
 * carried in the `element` attr and edited through an embedded NodeView. Tables
 * are block atoms with an isolated nested ProseMirror view (`tableBlockNodeView`).
 *
 * Inline content carries marks (strong/em/underline) plus two inline atoms:
 * `reference` (a citation chip, zero width in field-offset terms) and
 * `inlineEquation` (width = its `source` length). Keeping these widths aligned
 * with the Rust source map is what preserves preview caret sync — see
 * `astBridge.ts` `fieldCaretOffsetFromNode`.
 */

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
    // The live DOM is owned by a React NodeView; `toDOM`/`parseDOM` exist for the
    // clipboard. Serializing the full `element` payload (not just the kind label)
    // is what lets a copied block paste back as itself instead of the bare word
    // "Equation"/"Figure"/… — see `elementIds.ts` for the paste-time id refresh.
    parseDOM: [
        {
            tag: `div[data-element-kind="${kind}"]`,
            getAttrs: (dom) => {
                const el = dom as HTMLElement;
                const raw = el.getAttribute("data-ergo-element");
                let element: unknown = null;
                if (raw) {
                    try {
                        element = JSON.parse(raw);
                    } catch {
                        element = null;
                    }
                }
                const elementId =
                    el.getAttribute("data-element-id") ||
                    (element &&
                    typeof element === "object" &&
                    "id" in element
                        ? String((element as { id: unknown }).id)
                        : "") ||
                    "";
                return { element, elementId };
            },
        },
    ],
    toDOM: (node) => [
        "div",
        {
            "data-element-kind": kind,
            "data-element-id":
                (node.attrs.elementId as string) ||
                node.attrs.element?.id ||
                "",
            ...(node.attrs.element
                ? { "data-ergo-element": JSON.stringify(node.attrs.element) }
                : {}),
        },
        kind,
    ],
});

const blockObjectNodes: Record<string, NodeSpec> = {
    equation: atomBlock("Equation"),
    figure: atomBlock("Figure"),
    diagram: atomBlock("Diagram"),
    custom: atomBlock("Custom"),
    table_block: atomBlock("Table"),
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

export const bodySchema = new Schema({
    nodes: {
        ...baseNodes,
        ...blockObjectNodes,
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
]);

/** Block atom node type names backed by an embedded element editor. */
/** Isolating table block atom; edited via nested ProseMirror view. */
export const TABLE_BLOCK_NODE = "table_block";

export const ATOM_BLOCK_NODES = new Set([
    "equation",
    "figure",
    "diagram",
    "custom",
    TABLE_BLOCK_NODE,
]);

/**
 * Every node type that behaves as a self-contained block element: atom editors
 * plus the table wrapper. These share the locked ↔ fine-grained edit model
 * (see `blockEditMode.ts`).
 */
export const BLOCK_ELEMENT_NODES = new Set([
    ...ATOM_BLOCK_NODES,
    TABLE_BLOCK_NODE,
]);
