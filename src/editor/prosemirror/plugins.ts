import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";
import { Plugin, type EditorState, type Transaction } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { dropCursor } from "prosemirror-dropcursor";
import { createId } from "../../state/ast/defaults";
import { bodyKeyboardPlugin } from "./bodyKeyboardPlugin";
import { ATOM_BLOCK_NODES } from "./schema";
import { tableBlockFocusPlugin } from "./tableBlockFocus";
import { blockEditModePlugin } from "./blockEditMode";
import {
    blockOutsidePointerPlugin,
    blockSelectionGuardPlugin,
    clickBelowLastBlockPlugin,
} from "./blockSelectionGuard";
import { tableSelectionGuardPlugin } from "./tableSelectionGuard";

/**
 * Top-level block nodes whose `elementId` must be unique and non-empty. Splits
 * and pastes can produce blocks that share an id (the split copies attrs) or
 * have none (pasted HTML); both must be given a fresh stable id so every AST
 * element keeps a single identity and the source map stays continuous.
 */
const carriesElementId = (node: PMNode): boolean =>
    Object.prototype.hasOwnProperty.call(node.attrs, "elementId");

/**
 * Compute the positions of top-level blocks that need a fresh id, given the
 * blocks already seen (first occurrence of an id wins, so the original element
 * keeps its identity and a split-off duplicate is the one reassigned).
 */
export const idFixesForDoc = (doc: PMNode): number[] => {
    const seen = new Set<string>();
    const fixes: number[] = [];
    doc.forEach((node, offset) => {
        if (!carriesElementId(node)) {
            return;
        }
        const id = node.attrs.elementId as string;
        if (id && !seen.has(id)) {
            seen.add(id);
            return;
        }
        fixes.push(offset);
    });
    return fixes;
};

/** Some transforms copy atom attrs without the heavy `element` payload; restore it. */
const atomElementPreserver = new Plugin({
    appendTransaction(transactions, oldState, newState) {
        if (!transactions.some((tr) => tr.docChanged)) {
            return null;
        }
        const oldById = new Map<string, unknown>();
        oldState.doc.descendants((node) => {
            if (!ATOM_BLOCK_NODES.has(node.type.name)) {
                return;
            }
            const id = node.attrs.elementId as string;
            const element = node.attrs.element;
            if (id && element) {
                oldById.set(id, element);
            }
        });
        if (oldById.size === 0) {
            return null;
        }
        let tr = newState.tr;
        let changed = false;
        newState.doc.descendants((node, pos) => {
            if (!ATOM_BLOCK_NODES.has(node.type.name) || node.attrs.element) {
                return;
            }
            const id = node.attrs.elementId as string;
            const element = id ? oldById.get(id) : undefined;
            if (!element) {
                return;
            }
            tr = tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                element,
            });
            changed = true;
        });
        if (!changed) {
            return null;
        }
        tr.setMeta("addToHistory", false);
        return tr;
    },
});

const idNormalizer = new Plugin({
    appendTransaction(
        transactions: readonly Transaction[],
        _oldState: EditorState,
        newState: EditorState,
    ) {
        if (!transactions.some((tr) => tr.docChanged)) {
            return null;
        }
        const fixes = idFixesForDoc(newState.doc);
        if (fixes.length === 0) {
            return null;
        }
        const tr = newState.tr;
        for (const pos of fixes) {
            tr.setNodeAttribute(pos, "elementId", createId());
        }
        tr.setMeta("addToHistory", false);
        return tr;
    },
});

/** Typing shortcuts without arrow keys — those go through the action runtime. */
const typingKeymap = keymap(
    Object.fromEntries(
        Object.entries(baseKeymap).filter(([key]) => !/^Arrow/.test(key)),
    ),
);

export const bodyPlugins = () => [
    blockEditModePlugin(),
    // Must run before `tableEditing()` so a click outside an editing block is
    // turned into a sanctioned exit (edit-mode off + caret at the click) before
    // the table plugin claims the mousedown and the guards re-clamp inward.
    blockOutsidePointerPlugin(),
    clickBelowLastBlockPlugin(),
    tableSelectionGuardPlugin(),
    blockSelectionGuardPlugin(),
    tableBlockFocusPlugin(),
    typingKeymap,
    dropCursor(),
    atomElementPreserver,
    idNormalizer,
    bodyKeyboardPlugin(),
];
