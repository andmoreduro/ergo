import {
    NodeSelection,
    TextSelection,
    type EditorState,
    type Selection,
} from "prosemirror-state";
import type { Node as PMNode, ResolvedPos } from "prosemirror-model";
import type { DocumentElement } from "../../bindings/DocumentElement";
import { listItemFieldId, richTextFieldId } from "../fieldIds";
import { fieldCaretOffsetFromNode, pmPosForFieldCaret } from "./astBridge";
import { isBlockEditing } from "./blockEditMode";
import { ATOM_BLOCK_NODES, TABLE_BLOCK_NODE, TEXT_FIELD_NODES } from "./schema";
import { isTableCellFieldId } from "./table/tableCellFocus";

export interface BodyFocusTarget {
    elementId: string;
    fieldId: string | null;
    caretUtf16Offset: number | null;
}

const fieldIdentityAtHead = (
    $head: ResolvedPos,
): { elementId: string; fieldId: string } | null => {
    const name = $head.parent.type.name;

    if (name === "paragraph" || name === "heading" || name === "quote") {
        const elementId = $head.parent.attrs.elementId;
        return elementId
            ? { elementId, fieldId: richTextFieldId(elementId) }
            : null;
    }

    if (name === "list_item") {
        const list = $head.node($head.depth - 1);
        const itemIndex = $head.index($head.depth - 1);
        const elementId = list.attrs.elementId;
        return elementId
            ? { elementId, fieldId: listItemFieldId(elementId, itemIndex) }
            : null;
    }

    return null;
};

/** Resolve the current selection into an editor focus target, or null. */
export const focusTargetFromState = (
    state: EditorState,
): BodyFocusTarget | null => {
    const selection = state.selection;

    if (selection instanceof NodeSelection) {
        if (selection.node.type.name === TABLE_BLOCK_NODE) {
            const elementId = selection.node.attrs.elementId as string;
            if (!elementId || isBlockEditing(state, elementId)) {
                return null;
            }
            return { elementId, fieldId: null, caretUtf16Offset: null };
        }
        if (ATOM_BLOCK_NODES.has(selection.node.type.name)) {
            const element = selection.node.attrs.element as DocumentElement | null;
            const elementId =
                element?.id ?? (selection.node.attrs.elementId as string);
            return elementId
                ? { elementId, fieldId: null, caretUtf16Offset: null }
                : null;
        }
    }

    const $head = selection.$head;
    if (!TEXT_FIELD_NODES.has($head.parent.type.name)) {
        return null;
    }

    const identity = fieldIdentityAtHead($head);
    if (!identity) {
        return null;
    }

    return {
        ...identity,
        caretUtf16Offset: fieldCaretOffsetFromNode(
            $head.parent,
            $head.parentOffset,
        ),
    };
};

const childPosition = (parent: PMNode, parentStart: number, index: number) => {
    let pos = parentStart;
    for (let i = 0; i < index; i += 1) {
        pos += parent.child(i).nodeSize;
    }
    return pos;
};

interface FieldLocation {
    fieldNode: PMNode;
    contentStart: number;
}

const locateField = (
    blockNode: PMNode,
    blockPos: number,
    fieldId: string | null,
    elementId: string,
): FieldLocation | null => {
    if (fieldId === null || fieldId === richTextFieldId(elementId)) {
        return { fieldNode: blockNode, contentStart: blockPos + 1 };
    }

    const remainder = fieldId.slice(elementId.length + 1);
    const parts = remainder.split(":");

    if (parts[0] === "item") {
        const itemIndex = Number(parts[1]);
        if (!Number.isInteger(itemIndex) || itemIndex >= blockNode.childCount) {
            return null;
        }
        const itemPos = childPosition(blockNode, blockPos + 1, itemIndex);
        return {
            fieldNode: blockNode.child(itemIndex),
            contentStart: itemPos + 1,
        };
    }

    return null;
};

/** Build a selection that places the caret at a focus target inside the doc. */
export const selectionForFocusTarget = (
    doc: PMNode,
    target: BodyFocusTarget,
): Selection | null => {
    if (isTableCellFieldId(target.fieldId, target.elementId)) {
        return null;
    }

    let result: Selection | null = null;

    doc.descendants((node, pos) => {
        if (result) {
            return false;
        }

        if (
            node.type.name === TABLE_BLOCK_NODE &&
            node.attrs.elementId === target.elementId &&
            target.fieldId === null
        ) {
            result = NodeSelection.create(doc, pos);
            return false;
        }

        if (ATOM_BLOCK_NODES.has(node.type.name)) {
            const atomElementId =
                node.attrs.element?.id ?? (node.attrs.elementId as string);
            if (atomElementId === target.elementId) {
                result = NodeSelection.create(doc, pos);
                return false;
            }
        }

        if (node.attrs?.elementId === target.elementId) {
            const location = locateField(
                node,
                pos,
                target.fieldId,
                target.elementId,
            );
            if (location) {
                const caret =
                    location.contentStart +
                    pmPosForFieldCaret(
                        location.fieldNode,
                        target.caretUtf16Offset ?? 0,
                    );
                const clamped = Math.min(
                    caret,
                    location.contentStart + location.fieldNode.content.size,
                );
                result = TextSelection.create(doc, clamped);
            }
            return false;
        }

        return node.isBlock;
    });

    return result;
};
