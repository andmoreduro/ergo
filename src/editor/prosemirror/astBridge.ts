import { Fragment, type Node as PMNode, type Schema } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import type { ContentSection } from "../../bindings/ContentSection";
import type { DocumentElement } from "../../bindings/DocumentElement";
import type { RichText } from "../../bindings/RichText";
import { createRichText } from "../../state/ast/defaults";
import {
    ATOM_BLOCK_NODES,
    INLINE_EQUATION_NODE,
    REFERENCE_NODE,
    type BodySchema,
} from "./schema";

const REFERENCE_KIND = "reference";
const INLINE_EQUATION_KIND = "inlineEquation";

// ---------------------------------------------------------------------------
// Field-offset width — must match Rust `push_rich_text_field` accumulation
// (text → UTF-16 code units, reference → 0, inline equation → source length).
// JS string `.length` is UTF-16 code units, matching Rust `chars().len_utf16()`.
// ---------------------------------------------------------------------------

const spanWidth = (span: RichText): number => {
    if (span.kind === REFERENCE_KIND) {
        return 0;
    }
    if (span.kind === INLINE_EQUATION_KIND) {
        return (span.equation_source ?? "").length;
    }
    return span.text.length;
};

/** Field-scoped UTF-16 length of a rich-text field, matching the source map. */
export const richTextFieldLength = (content: readonly RichText[]): number =>
    content.reduce((total, span) => total + spanWidth(span), 0);

const atomNodeWidth = (node: PMNode): number => {
    if (node.type.name === INLINE_EQUATION_NODE) {
        return (node.attrs.source ?? "").length;
    }
    return 0; // reference (and any other inline atom) is zero width
};

// ---------------------------------------------------------------------------
// RichText[] ↔ ProseMirror inline fragment
// ---------------------------------------------------------------------------

type RichTextSchema = Pick<Schema, "text" | "nodes" | "marks">;

export const richTextToInlineNodes = (
    schema: RichTextSchema,
    content: readonly RichText[],
): PMNode[] => {
    const nodes: PMNode[] = [];
    for (const span of content) {
        if (span.kind === REFERENCE_KIND && span.reference_id) {
            nodes.push(
                schema.nodes.reference.create({
                    referenceId: span.reference_id,
                    label: span.text,
                }),
            );
            continue;
        }
        if (span.kind === INLINE_EQUATION_KIND) {
            nodes.push(
                schema.nodes.inlineEquation.create({
                    source: span.equation_source ?? span.text,
                    syntax: span.equation_syntax,
                    label: span.text,
                }),
            );
            continue;
        }
        if (span.text.length === 0) {
            continue;
        }
        const marks = [];
        if (span.bold) marks.push(schema.marks.strong.create());
        if (span.italic) marks.push(schema.marks.em.create());
        if (span.underline) marks.push(schema.marks.underline.create());
        nodes.push(schema.text(span.text, marks));
    }
    return nodes;
};

const textSpanFromNode = (node: PMNode): RichText => ({
    ...createRichText(node.text ?? ""),
    bold: node.marks.some((mark) => mark.type.name === "strong") ? true : null,
    italic: node.marks.some((mark) => mark.type.name === "em") ? true : null,
    underline: node.marks.some((mark) => mark.type.name === "underline") ? true : null,
});

const sameMarks = (a: RichText, b: RichText): boolean =>
    a.bold === b.bold && a.italic === b.italic && a.underline === b.underline;

const mergeAdjacentText = (spans: RichText[]): RichText[] => {
    const merged: RichText[] = [];
    for (const span of spans) {
        const previous = merged[merged.length - 1];
        const bothPlain = previous && !previous.kind && !span.kind;
        if (bothPlain && sameMarks(previous, span)) {
            merged[merged.length - 1] = { ...previous, text: previous.text + span.text };
            continue;
        }
        merged.push(span);
    }
    return merged;
};

const collectRichTextFromNode = (node: PMNode, spans: RichText[]): void => {
    if (node.type.name === REFERENCE_NODE) {
        spans.push({
            ...createRichText(node.attrs.label),
            kind: REFERENCE_KIND,
            reference_id: node.attrs.referenceId,
        });
        return;
    }
    if (node.type.name === INLINE_EQUATION_NODE) {
        spans.push({
            ...createRichText(node.attrs.label),
            kind: INLINE_EQUATION_KIND,
            equation_source: node.attrs.source,
            equation_syntax: node.attrs.syntax === "latex" ? "latex" : "typst",
        });
        return;
    }
    if (node.isText) {
        spans.push(textSpanFromNode(node));
        return;
    }
    if (node.type.name === "hard_break") {
        spans.push(createRichText("\n"));
        return;
    }
    if (node.childCount > 0) {
        node.forEach((child) => collectRichTextFromNode(child, spans));
    }
};

export const fragmentToRichText = (fragment: Fragment): RichText[] => {
    const spans: RichText[] = [];
    let first = true;
    fragment.forEach((node) => {
        if (!first && node.isBlock) {
            spans.push(createRichText("\n"));
        }
        first = false;
        collectRichTextFromNode(node, spans);
    });
    return mergeAdjacentText(spans);
};

// ---------------------------------------------------------------------------
// Field caret offset ↔ ProseMirror content position
//
// `posInContent` is the offset relative to the START of a field node's content
// (0 = before the first child). The returned value is the field-scoped UTF-16
// offset that the focus tuple / source map speaks. These are the functions the
// whole preview-sync contract rests on.
// ---------------------------------------------------------------------------

export const fieldCaretOffsetFromNode = (
    fieldNode: PMNode,
    posInContent: number,
): number => {
    let pm = 0;
    let utf16 = 0;
    const fragment = fieldNode.content;
    for (let i = 0; i < fragment.childCount; i += 1) {
        const child = fragment.child(i);
        const size = child.nodeSize;
        if (posInContent <= pm + size) {
            if (child.isText) {
                utf16 += posInContent - pm;
            } else if (posInContent >= pm + size) {
                utf16 += atomNodeWidth(child);
            }
            return utf16;
        }
        utf16 += child.isText ? size : atomNodeWidth(child);
        pm += size;
    }
    return utf16;
};

export const pmPosForFieldCaret = (
    fieldNode: PMNode,
    utf16Target: number,
): number => {
    let pm = 0;
    let utf16 = 0;
    const fragment = fieldNode.content;
    for (let i = 0; i < fragment.childCount; i += 1) {
        const child = fragment.child(i);
        if (child.isText) {
            const width = child.nodeSize;
            if (utf16Target <= utf16 + width) {
                return pm + (utf16Target - utf16);
            }
            utf16 += width;
            pm += width;
        } else {
            const width = atomNodeWidth(child);
            if (utf16Target <= utf16 + width) {
                return utf16Target <= utf16 ? pm : pm + child.nodeSize;
            }
            utf16 += width;
            pm += child.nodeSize;
        }
    }
    return pm;
};

// ---------------------------------------------------------------------------
// DocumentElement ↔ ProseMirror node
// ---------------------------------------------------------------------------

const ATOM_NODE_BY_TYPE: Record<string, string> = {
    Equation: "equation",
    Figure: "figure",
    Diagram: "diagram",
    Custom: "custom",
};

const listNode = (
    schema: BodySchema,
    id: string,
    ordered: boolean,
    items: RichText[][],
): PMNode => {
    const source = items.length > 0 ? items : [[]];
    const listItems = source.map((item) =>
        schema.nodes.list_item.create(null, richTextToInlineNodes(schema, item)),
    );
    return schema.nodes.list.create({ elementId: id, ordered }, listItems);
};

export const elementToNode = (
    schema: BodySchema,
    element: DocumentElement,
): PMNode => {
    switch (element.type) {
        case "Paragraph":
            return schema.nodes.paragraph.create(
                { elementId: element.id },
                richTextToInlineNodes(schema, element.content),
            );
        case "Heading":
            return schema.nodes.heading.create(
                { elementId: element.id, level: element.level },
                richTextToInlineNodes(schema, element.content),
            );
        case "Quote":
            return schema.nodes.quote.create(
                { elementId: element.id },
                richTextToInlineNodes(schema, element.content),
            );
        case "List":
            return listNode(schema, element.id, false, element.items);
        case "Enumeration":
            return listNode(schema, element.id, true, element.items);
        case "Table":
            return schema.nodes.table_block.create({
                element,
                elementId: element.id,
            });
        case "Equation":
        case "Figure":
        case "Diagram":
        case "Custom":
            return schema.nodes[ATOM_NODE_BY_TYPE[element.type]].create({
                element,
                elementId: element.id,
            });
    }
};

export const nodeToElement = (node: PMNode): DocumentElement => {
    switch (node.type.name) {
        case "paragraph":
            return {
                type: "Paragraph",
                id: node.attrs.elementId,
                content: fragmentToRichText(node.content),
            };
        case "heading":
            return {
                type: "Heading",
                id: node.attrs.elementId,
                level: node.attrs.level,
                content: fragmentToRichText(node.content),
            };
        case "quote":
            return {
                type: "Quote",
                id: node.attrs.elementId,
                content: fragmentToRichText(node.content),
            };
        case "list": {
            const items: RichText[][] = [];
            node.content.forEach((item) => items.push(fragmentToRichText(item.content)));
            return node.attrs.ordered
                ? { type: "Enumeration", id: node.attrs.elementId, items }
                : { type: "List", id: node.attrs.elementId, items };
        }
        default:
            if (ATOM_BLOCK_NODES.has(node.type.name)) {
                const element = node.attrs.element as DocumentElement | null;
                if (element) {
                    return element;
                }
                throw new Error(
                    `Atom block ${node.type.name} is missing element payload (id=${node.attrs.elementId})`,
                );
            }
            throw new Error(`Unmapped ProseMirror node type: ${node.type.name}`);
    }
};

// ---------------------------------------------------------------------------
// ContentSection ↔ ProseMirror document
// ---------------------------------------------------------------------------

export const sectionToDoc = (
    schema: BodySchema,
    section: ContentSection,
): PMNode => {
    const blocks = section.elements.map((element) => elementToNode(schema, element));
    if (blocks.length === 0) {
        blocks.push(schema.nodes.paragraph.create({ elementId: "" }));
    }
    return schema.nodes.doc.create(null, blocks);
};

export const docToElements = (doc: PMNode): DocumentElement[] => {
    const elements: DocumentElement[] = [];
    doc.content.forEach((node) => elements.push(nodeToElement(node)));
    return elements;
};

/**
 * The inclusive range of top-level block indices a transaction modified, in the
 * resulting document's coordinates — or null when it can't be derived safely as
 * an in-place edit. Restricted to single-step transactions so the step map's
 * positions are already in the final doc's coordinate space (multi-step
 * transactions, e.g. paste, return null and the caller re-derives the whole
 * section). Lets the body editor convert/diff only the blocks that changed.
 */
export const changedTopLevelRange = (
    tr: Transaction,
): [number, number] | null => {
    if (tr.steps.length !== 1) {
        return null;
    }
    const doc = tr.doc;
    const map = tr.mapping.maps[0];
    if (!map) {
        return null;
    }
    let from = Infinity;
    let to = -Infinity;
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
        if (newStart < from) from = newStart;
        if (newEnd > to) to = newEnd;
    });
    if (from === Infinity) {
        return null;
    }
    const size = doc.content.size;
    const lastIndex = Math.max(0, doc.childCount - 1);
    const fromIndex = Math.min(
        doc.resolve(Math.max(0, Math.min(from, size))).index(0),
        lastIndex,
    );
    const toIndex = Math.min(
        doc.resolve(Math.max(0, Math.min(to, size))).index(0),
        lastIndex,
    );
    return [Math.min(fromIndex, toIndex), Math.max(fromIndex, toIndex)];
};
