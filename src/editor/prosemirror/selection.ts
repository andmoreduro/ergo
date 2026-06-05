import {
    NodeSelection,
    TextSelection,
    type EditorState,
    type Selection,
} from "prosemirror-state";
import type { Node as PMNode, ResolvedPos } from "prosemirror-model";
import type { DocumentElement } from "../../bindings/DocumentElement";
import { listItemFieldId, quoteContentFieldId, richTextFieldId } from "../fieldIds";
import { parseListItemFieldPath } from "../listFieldPath";
import { listItemPathFromPosition } from "./listPath";
import { fieldCaretOffsetFromNode, listItemParagraph, pmPosForFieldCaret } from "./astBridge";
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
        if (name === "paragraph") {
            for (let depth = $head.depth - 1; depth > 0; depth -= 1) {
                if ($head.node(depth).type.name === "list_item") {
                    for (let listDepth = depth - 1; listDepth > 0; listDepth -= 1) {
                        if ($head.node(listDepth).type.name === "list") {
                            const elementId = $head.node(listDepth).attrs
                                .elementId as string;
                            if (elementId) {
                                return {
                                    elementId,
                                    fieldId: listItemFieldId(
                                        elementId,
                                        listItemPathFromPosition($head),
                                    ),
                                };
                            }
                        }
                    }
                }
            }
        }
        const elementId = $head.parent.attrs.elementId;
        if (!elementId) {
            return null;
        }
        if (name === "quote") {
            return { elementId, fieldId: quoteContentFieldId(elementId) };
        }
        return { elementId, fieldId: richTextFieldId(elementId) };
    }

    if (name === "list_item") {
        for (let depth = $head.depth; depth > 0; depth -= 1) {
            if ($head.node(depth).type.name === "list") {
                const elementId = $head.node(depth).attrs.elementId as string;
                if (elementId) {
                    const paragraph = listItemParagraph($head.parent);
                    if (!paragraph) {
                        return null;
                    }
                    return {
                        elementId,
                        fieldId: listItemFieldId(
                            elementId,
                            listItemPathFromPosition($head),
                        ),
                    };
                }
            }
        }
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

export const locateListItemField = (
    listNode: PMNode,
    listStart: number,
    indices: readonly number[],
): FieldLocation | null => {
    let node = listNode;
    let pos = listStart;
    for (let depth = 0; depth < indices.length; depth += 1) {
        const index = indices[depth];
        if (node.type.name !== "list" || index >= node.childCount) {
            return null;
        }
        pos = childPosition(node, pos, index);
        const itemNode = node.child(index);
        if (depth === indices.length - 1) {
            const paragraph = listItemParagraph(itemNode);
            if (!paragraph) {
                return null;
            }
            return { fieldNode: paragraph, contentStart: pos + 2 };
        }
        let nestedList: PMNode | null = null;
        itemNode.forEach((child) => {
            if (child.type.name === "list") {
                nestedList = child;
            }
        });
        if (!nestedList) {
            return null;
        }
        pos = pos + itemNode.nodeSize - nestedList.nodeSize - 1;
        node = nestedList;
    }
    return null;
};

const locateField = (
    blockNode: PMNode,
    blockPos: number,
    fieldId: string | null,
    elementId: string,
): FieldLocation | null => {
    if (fieldId === null || fieldId === richTextFieldId(elementId)) {
        return { fieldNode: blockNode, contentStart: blockPos + 1 };
    }

    if (
        fieldId === quoteContentFieldId(elementId) &&
        blockNode.type.name === "quote"
    ) {
        return { fieldNode: blockNode, contentStart: blockPos + 1 };
    }

    const itemPath = parseListItemFieldPath(fieldId, elementId);
    if (itemPath && blockNode.type.name === "list") {
        return locateListItemField(blockNode, blockPos + 1, itemPath);
    }

    return null;
};

/** Build a selection that places the caret at a focus target inside the doc. */
const pmPosForFocusTarget = (
    doc: PMNode,
    target: BodyFocusTarget,
    utf16Offset: number,
): number | null => {
    if (isTableCellFieldId(target.fieldId, target.elementId)) {
        return null;
    }

    let result: number | null = null;

    doc.descendants((node, pos) => {
        if (result != null) {
            return false;
        }

        if (
            node.type.name === TABLE_BLOCK_NODE &&
            node.attrs.elementId === target.elementId &&
            target.fieldId === null
        ) {
            result = pos;
            return false;
        }

        if (ATOM_BLOCK_NODES.has(node.type.name)) {
            const atomElementId =
                node.attrs.element?.id ?? (node.attrs.elementId as string);
            if (atomElementId === target.elementId) {
                result = pos;
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
                        utf16Offset,
                    );
                result = Math.min(
                    caret,
                    location.contentStart + location.fieldNode.content.size,
                );
            }
            return false;
        }

        return node.isBlock;
    });

    return result;
};

/** Build a selection that places the caret at a focus target inside the doc. */
export const selectionForFocusTarget = (
    doc: PMNode,
    target: BodyFocusTarget,
): Selection | null => {
    if (isTableCellFieldId(target.fieldId, target.elementId)) {
        return null;
    }

    if (target.fieldId === null) {
        let blockSelection: Selection | null = null;
        doc.descendants((node, pos) => {
            if (blockSelection) {
                return false;
            }
            if (
                node.type.name === TABLE_BLOCK_NODE &&
                node.attrs.elementId === target.elementId
            ) {
                blockSelection = NodeSelection.create(doc, pos);
                return false;
            }
            if (ATOM_BLOCK_NODES.has(node.type.name)) {
                const atomElementId =
                    node.attrs.element?.id ?? (node.attrs.elementId as string);
                if (atomElementId === target.elementId) {
                    blockSelection = NodeSelection.create(doc, pos);
                    return false;
                }
            }
            return node.isBlock;
        });
        if (blockSelection) {
            return blockSelection;
        }
    }

    const caret =
        target.caretUtf16Offset == null ? 0 : target.caretUtf16Offset;
    const pos = pmPosForFocusTarget(doc, target, caret);
    return pos == null ? null : TextSelection.create(doc, pos);
};

/** Build a text selection spanning UTF-16 offsets inside a focus target field. */
export const selectionForFocusRange = (
    doc: PMNode,
    target: BodyFocusTarget,
    endUtf16Offset: number,
): Selection | null => {
    const startOffset = target.caretUtf16Offset ?? 0;
    const from = pmPosForFocusTarget(doc, target, startOffset);
    const to = pmPosForFocusTarget(doc, target, endUtf16Offset);
    if (from == null || to == null) {
        return null;
    }
    const anchor = Math.min(from, to);
    const head = Math.max(from, to);
    return TextSelection.create(doc, anchor, head);
};
