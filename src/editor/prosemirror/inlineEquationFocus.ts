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
import { INLINE_EQUATION_NODE } from "./schema";
import type { BodyFocusTarget } from "./selection";
import { tableSchema } from "./table/tableSchema";

export interface InlineEquationFocusHandle {
    focus: (caret?: number) => void;
    blur: () => void;
    isFocused: () => boolean;
}

const handles = new WeakMap<HTMLElement, InlineEquationFocusHandle>();

export const registerInlineEquationHandle = (
    dom: HTMLElement,
    handle: InlineEquationFocusHandle,
): void => {
    handles.set(dom, handle);
};

export const unregisterInlineEquationHandle = (dom: HTMLElement): void => {
    handles.delete(dom);
};

export const focusInlineEquationDom = (
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

let activeInlineEquation: {
    view: EditorView;
    getFieldTarget: () => BodyFocusTarget | null;
} | null = null;

export const setActiveInlineEquationFocus = (
    entry: typeof activeInlineEquation,
): void => {
    activeInlineEquation = entry;
};

export const getActiveInlineEquationFocus = (): typeof activeInlineEquation =>
    activeInlineEquation;

const caretInBlock = (
    block: PMNode,
    blockContentStart: number,
    equationPos: number,
    caretInSource: number,
): number =>
    fieldCaretOffsetFromNode(block, equationPos - blockContentStart) +
    caretInSource;

export const focusTargetForInlineEquationAtPos = (
    view: EditorView,
    equationPos: number,
    caretInSource: number,
    tableId?: string | null,
): BodyFocusTarget | null => {
    const $eq = view.state.doc.resolve(equationPos);
    const equation = $eq.nodeAfter ?? $eq.nodeBefore;
    if (equation?.type.name !== INLINE_EQUATION_NODE) {
        return null;
    }

    for (let depth = $eq.depth; depth > 0; depth -= 1) {
        const node = $eq.node(depth);
        const contentStart = $eq.start(depth) + 1;

        if (node.type.name === "paragraph" || node.type.name === "heading") {
            const elementId = node.attrs.elementId as string;
            if (!elementId) {
                return null;
            }
            const caretUtf16Offset = caretInBlock(
                node,
                contentStart,
                equationPos,
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
                    equationPos,
                    caretInSource,
                ),
            };
        }

        if (node.type.name === "list_item") {
            for (let listDepth = depth - 1; listDepth > 0; listDepth -= 1) {
                const list = $eq.node(listDepth);
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
                        listItemPathFromPosition($eq),
                    ),
                    caretUtf16Offset: caretInBlock(
                        node,
                        contentStart,
                        equationPos,
                        caretInSource,
                    ),
                };
            }
        }
    }

    return null;
};

export const focusInlineEquationAtPos = (
    view: EditorView,
    equationPos: number,
    caret?: number,
): boolean => {
    const dom = view.nodeDOM(equationPos);
    if (!(dom instanceof HTMLElement)) {
        return false;
    }
    const host =
        dom.querySelector<HTMLElement>("[data-inline-equation-host]") ?? dom;
    return focusInlineEquationDom(host, caret);
};

export const adjacentInlineEquation = (
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
    if (node?.type.name !== INLINE_EQUATION_NODE) {
        return null;
    }
    return side === "before"
        ? selection.from - node.nodeSize
        : selection.from;
};

export const tryEnterAdjacentInlineEquation = (
    view: EditorView,
    side: "before" | "after",
): boolean => {
    const pos = adjacentInlineEquation(view, side);
    if (pos === null) {
        return false;
    }
    return focusInlineEquationAtPos(view, pos, side === "before" ? undefined : 0);
};

export const tryEnterInlineEquationVertically = (
    view: EditorView,
    direction: "up" | "down",
): boolean => {
    const { selection } = view.state;
    if (!(selection instanceof TextSelection) || !selection.empty) {
        return false;
    }

    const atBoundary =
        direction === "down"
            ? view.endOfTextblock("down")
            : view.endOfTextblock("up");
    if (!atBoundary) {
        return false;
    }

    const headCoords = view.coordsAtPos(selection.head);
    const probeTop =
        direction === "down"
            ? headCoords.bottom + 1
            : headCoords.top - 1;
    const hit = view.posAtCoords({ left: headCoords.left, top: probeTop });
    if (!hit) {
        return false;
    }

    const $hit = view.state.doc.resolve(hit.pos);
    const candidates = [$hit.nodeBefore, $hit.nodeAfter];
    for (const node of candidates) {
        if (node?.type.name !== INLINE_EQUATION_NODE) {
            continue;
        }
        const pos =
            $hit.nodeBefore === node ? hit.pos - node.nodeSize : hit.pos;
        return focusInlineEquationAtPos(
            view,
            pos,
            direction === "down" ? 0 : undefined,
        );
    }

    return false;
};

export const exitAfterInlineEquation = (
    view: EditorView,
    equationPos: number,
    nodeSize: number,
): void => {
    const after = equationPos + nodeSize;
    view.dispatch(
        view.state.tr
            .setSelection(TextSelection.create(view.state.doc, after))
            .scrollIntoView(),
    );
    view.focus();
};

export const focusInlineEquationAfterInsert = (view: EditorView): void => {
    const { selection } = view.state;
    const equation = selection.$from.nodeBefore;
    if (equation?.type.name !== INLINE_EQUATION_NODE) {
        return;
    }
    const pos = selection.from - equation.nodeSize;
    requestAnimationFrame(() => {
        focusInlineEquationAtPos(view, pos, 0);
    });
};
