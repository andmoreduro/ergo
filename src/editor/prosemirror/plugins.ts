import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";
import { Plugin, type EditorState, type Transaction } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { dropCursor } from "prosemirror-dropcursor";
import { createId } from "../../state/ast/defaults";
import type { DocumentElement } from "../../bindings/DocumentElement";
import { bodyKeyboardPlugin } from "./bodyKeyboardPlugin";
import { selectCurrentOrAllElements } from "./bodySelection";
import { elementPointerSelectPlugin } from "./elementPointerSelect";
import { regenerateElementIds } from "./elementIds";
import { ATOM_BLOCK_NODES } from "./schema";
import { tableBlockFocusPlugin } from "./tableBlockFocus";
import { blockEditModePlugin } from "./blockEditMode";
import { clipboardPastePlugin } from "./clipboardPastePlugin";
import {
    blockOutsidePointerPlugin,
    blockSelectionGuardPlugin,
    clickBelowLastBlockPlugin,
} from "./blockSelectionGuard";

/**
 * Flag set on the transaction `idNormalizer` appends when it reassigns one or
 * more duplicated/empty `elementId`s. `atomElementIdSync` keys off this so its
 * full-document walk only runs right after an id was actually reassigned —
 * never on the plain-typing hot path, where no atom payload can be stale.
 */
const ID_REASSIGNED_META = "idsReassigned";

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
        tr.setMeta(ID_REASSIGNED_META, true);
        return tr;
    },
});

/**
 * After `idNormalizer` reassigns a duplicated/pasted atom's `elementId`, its
 * `element` payload still carries the old id (and old nested ids). Re-clone the
 * payload with the new top-level id and fresh nested ids so a pasted figure/table
 * never shares an identity — top-level or nested — with its source.
 */
const atomElementIdSync = new Plugin({
    appendTransaction(transactions, _oldState, newState) {
        // Only relevant immediately after `idNormalizer` reassigned an id; plain
        // typing never makes an atom's `element` payload stale, so skip the
        // whole-document walk on the hot path.
        if (!transactions.some((tr) => tr.getMeta(ID_REASSIGNED_META))) {
            return null;
        }
        let tr = newState.tr;
        let changed = false;
        newState.doc.descendants((node, pos) => {
            if (!ATOM_BLOCK_NODES.has(node.type.name)) {
                return;
            }
            const attrId = node.attrs.elementId as string;
            const element = node.attrs.element as DocumentElement | null;
            if (!attrId || !element || element.id === attrId) {
                return;
            }
            tr = tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                element: regenerateElementIds(element, attrId),
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

/**
 * Ctrl+A escalates current element → all elements. Registered before
 * `typingKeymap` so it wins over `baseKeymap`'s `Mod-a` (`selectAll`), and runs
 * synchronously so the browser never selects the whole page. Nested table-cell
 * editing uses a separate view, so Ctrl+A there keeps its native behavior.
 */
const selectionKeymap = keymap({ "Mod-a": selectCurrentOrAllElements });

/** Typing shortcuts without arrow keys — those go through the action runtime. */
const typingKeymap = keymap(
    Object.fromEntries(
        Object.entries(baseKeymap).filter(([key]) => !/^Arrow/.test(key)),
    ),
);
// Note: Mod-b / Mod-i / Mod-u are intentionally NOT registered here. baseKeymap
// carries none of them, so bold/italic/underline all flow through the action
// runtime (editor::Bold/Italic/Underline -> applyBodyMark). Registering Mod-u
// here too made underline toggle twice (PM applied it, then the action runtime
// toggled it back off), which the toolbar — single path — never hit.

export const bodyPlugins = () => [
    clipboardPastePlugin(),
    blockEditModePlugin(),
    // Before `typingKeymap` (baseKeymap): locked-block Tab / Ctrl+Enter / Enter
    // must run first or splitBlock and other defaults steal the keys.
    bodyKeyboardPlugin(),
    // Must run before `tableEditing()` so a click outside an editing block is
    // turned into a sanctioned exit (edit-mode off + caret at the click) before
    // the table plugin claims the mousedown and the guards re-clamp inward.
    blockOutsidePointerPlugin(),
    clickBelowLastBlockPlugin(),
    blockSelectionGuardPlugin(),
    elementPointerSelectPlugin(),
    tableBlockFocusPlugin(),
    selectionKeymap,
    typingKeymap,
    dropCursor(),
    atomElementPreserver,
    idNormalizer,
    atomElementIdSync,
];
