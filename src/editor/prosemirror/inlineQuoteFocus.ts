import type { Node as PMNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import {
    listItemFieldId,
    quoteContentFieldId,
    richTextFieldId,
} from "../fieldIds";
import { listItemPathFromPosition } from "./listPath";
import { fieldCaretOffsetFromNode } from "./astBridge";
import { INLINE_QUOTE_NODE } from "./schema";
import type { BodyFocusTarget } from "./selection";
import { tableSchema } from "./table/tableSchema";

export interface InlineQuoteFocusHandle {
    focus: (caret?: number) => void;
    blur: () => void;
    isFocused: () => boolean;
}

const handles = new WeakMap<HTMLElement, InlineQuoteFocusHandle>();

export const registerInlineQuoteHandle = (
    dom: HTMLElement,
    handle: InlineQuoteFocusHandle,
): void => {
    handles.set(dom, handle);
};

export const unregisterInlineQuoteHandle = (dom: HTMLElement): void => {
    handles.delete(dom);
};

export const focusInlineQuoteDom = (
    dom: HTMLElement,
    caret?: number,
): boolean => {
    const handle = handles.get(dom);
    if (!handle) {
        return false;
    }
    handle.focus(caret);
    return true;
};

let activeInlineQuote: {
    view: EditorView;
    getFieldTarget: () => BodyFocusTarget | null;
} | null = null;

export const setActiveInlineQuoteFocus = (
    entry: typeof activeInlineQuote,
): void => {
    activeInlineQuote = entry;
};

const caretInBlock = (
    block: PMNode,
    blockContentStart: number,
    quotePos: number,
    caretInSource: number,
): number =>
    fieldCaretOffsetFromNode(block, quotePos - blockContentStart) +
    caretInSource;

export const focusTargetForInlineQuoteAtPos = (
    view: EditorView,
    quotePos: number,
    caretInSource: number,
    tableId?: string | null,
): BodyFocusTarget | null => {
    const $quote = view.state.doc.resolve(quotePos);
    const inlineQuote = $quote.nodeAfter ?? $quote.nodeBefore;
    if (inlineQuote?.type.name !== INLINE_QUOTE_NODE) {
        return null;
    }

    for (let depth = $quote.depth; depth > 0; depth -= 1) {
        const node = $quote.node(depth);
        const contentStart = $quote.start(depth) + 1;

        if (node.type.name === "paragraph" || node.type.name === "heading") {
            const elementId = node.attrs.elementId as string;
            if (!elementId) {
                return null;
            }
            const caretUtf16Offset = caretInBlock(
                node,
                contentStart,
                quotePos,
                caretInSource,
            );
            if (view.state.schema === tableSchema && tableId) {
                return {
                    elementId: tableId,
                    fieldId: richTextFieldId(elementId),
                    caretUtf16Offset,
                };
            }
            return {
                elementId,
                fieldId: richTextFieldId(elementId),
                caretUtf16Offset,
            };
        }

        if (node.type.name === "quote") {
            const elementId = node.attrs.elementId as string;
            if (!elementId) {
                return null;
            }
            return {
                elementId,
                fieldId: quoteContentFieldId(elementId),
                caretUtf16Offset: caretInBlock(
                    node,
                    contentStart,
                    quotePos,
                    caretInSource,
                ),
            };
        }

        if (node.type.name === "list_item") {
            for (let listDepth = depth - 1; listDepth > 0; listDepth -= 1) {
                const list = $quote.node(listDepth);
                if (list.type.name !== "list") {
                    continue;
                }
                const elementId = list.attrs.elementId as string;
                if (!elementId) {
                    continue;
                }
                return {
                    elementId,
                    fieldId: listItemFieldId(
                        elementId,
                        listItemPathFromPosition($quote),
                    ),
                    caretUtf16Offset: caretInBlock(
                        node,
                        contentStart,
                        quotePos,
                        caretInSource,
                    ),
                };
            }
        }
    }

    return null;
};

export const focusInlineQuoteAtPos = (
    view: EditorView,
    quotePos: number,
    caret?: number,
): boolean => {
    const dom = view.nodeDOM(quotePos);
    if (!(dom instanceof HTMLElement)) {
        return false;
    }
    const host =
        dom.querySelector<HTMLElement>("[data-inline-quote-host]") ?? dom;
    return focusInlineQuoteDom(host, caret);
};

export const exitAfterInlineQuote = (
    view: EditorView,
    quotePos: number,
    nodeSize: number,
): void => {
    const after = quotePos + nodeSize;
    const doc = view.state.doc;
    const selection = TextSelection.near(doc.resolve(after), 1);
    view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
    view.focus();
};

export const focusInlineQuoteAfterInsert = (view: EditorView): void => {
    const { selection } = view.state;
    const node = selection.$from.nodeBefore;
    if (node?.type.name !== INLINE_QUOTE_NODE) {
        return;
    }
    const pos = selection.from - node.nodeSize;
    requestAnimationFrame(() => {
        focusInlineQuoteAtPos(view, pos, 0);
    });
};

export const adjacentInlineQuote = (
    view: EditorView,
    side: "before" | "after",
): number | null => {
    const { selection } = view.state;
    if (!(selection instanceof TextSelection) || !selection.empty) {
        return null;
    }
    const node =
        side === "before"
            ? selection.$from.nodeBefore
            : selection.$from.nodeAfter;
    if (node?.type.name !== INLINE_QUOTE_NODE) {
        return null;
    }
    return side === "before"
        ? selection.from - node.nodeSize
        : selection.from;
};

export const tryEnterAdjacentInlineQuote = (
    view: EditorView,
    side: "before" | "after",
): boolean => {
    const pos = adjacentInlineQuote(view, side);
    if (pos === null) {
        return false;
    }
    return focusInlineQuoteAtPos(view, pos, side === "before" ? undefined : 0);
};
