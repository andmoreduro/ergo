import { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { blockEditIds, setBlockEditing } from "./blockEditMode";
import { BLOCK_ELEMENT_NODES, TABLE_BLOCK_NODE } from "./schema";

/**
 * The one rule that keeps block editing coherent: a block is in fine-grained
 * ("editing") mode only while DOM focus is inside it. Every other piece of
 * state — the locked/editing outline, the extras panel, the selection clamp —
 * derives from that mode, so the moment focus lands anywhere else (the
 * ProseMirror root, a template field, the menubar) the mode ends, in one
 * transaction, and the block goes back to being a locked whole.
 *
 * Without this rule each way of moving focus (Tab cycles, Escape, clicks,
 * preview navigation, field navigation, inserts) had to remember to exit edit
 * mode itself, and the ones that forgot left the editor half-way: block still
 * "editing" (inputs open, dashed outline) while ProseMirror owned the keyboard
 * and typing replaced the whole block.
 *
 * Transient surfaces that belong to the block's editing session — its settings
 * dialog, menus — do not end it (`[role="dialog"]`, `[role="menu"]`, and the
 * `data-editor-focus-lose-exempt` regions).
 */
const FOCUS_EXEMPT_SELECTOR =
    '[role="dialog"], [role="menu"], [data-editor-focus-lose-exempt]';

interface EditingBlock {
    dom: HTMLElement;
    /** Table cells are ProseMirror content: the editor root itself is "inside". */
    isTable: boolean;
}

const editingBlocks = (view: EditorView): EditingBlock[] => {
    const ids = blockEditIds(view.state);
    if (ids.size === 0) {
        return [];
    }
    const blocks: EditingBlock[] = [];
    view.state.doc.descendants((node, pos) => {
        if (!BLOCK_ELEMENT_NODES.has(node.type.name)) {
            return node.isBlock;
        }
        const elementId =
            (node.attrs.elementId as string) ||
            (node.attrs.element as { id?: string } | null)?.id ||
            "";
        if (elementId && ids.has(elementId)) {
            const dom = view.nodeDOM(pos);
            if (dom instanceof HTMLElement) {
                blocks.push({ dom, isTable: node.type.name === TABLE_BLOCK_NODE });
            }
        }
        return false;
    });
    return blocks;
};

/** Leave fine-grained mode for every editing block; the selection is kept. */
export const exitAllBlockEditing = (view: EditorView): boolean => {
    const ids = blockEditIds(view.state);
    if (ids.size === 0) {
        return false;
    }
    let tr = view.state.tr;
    for (const elementId of ids) {
        tr = setBlockEditing(tr, elementId, false);
    }
    view.dispatch(tr);
    return true;
};

/** Whether `target` counts as "inside" the editing session of `view`'s blocks. */
export const focusStaysInsideEditingBlock = (
    view: EditorView,
    target: EventTarget | null,
): boolean => {
    if (!(target instanceof Node)) {
        return false;
    }
    const element = target instanceof Element ? target : target.parentElement;
    if (element?.closest(FOCUS_EXEMPT_SELECTOR)) {
        return true;
    }
    const blocks = editingBlocks(view);
    if (target === view.dom) {
        // The root holds the caret for table cells; for atoms it means the
        // focus left the block's own editor.
        return blocks.some((block) => block.isTable);
    }
    return blocks.some((block) => block.dom.contains(target));
};

export const blockFocusInvariantPlugin = () =>
    new Plugin({
        view(view: EditorView) {
            const onFocusIn = (event: FocusEvent) => {
                if (blockEditIds(view.state).size === 0) {
                    return;
                }
                if (focusStaysInsideEditingBlock(view, event.target)) {
                    return;
                }
                exitAllBlockEditing(view);
            };
            const root = view.dom.ownerDocument;
            root.addEventListener("focusin", onFocusIn, true);
            return {
                destroy() {
                    root.removeEventListener("focusin", onFocusIn, true);
                },
            };
        },
    });
