import type { Node as PMNode } from "prosemirror-model";
import type { ResolvedPos } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import type { Command } from "prosemirror-state";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { selectionCell, TableMap } from "prosemirror-tables";
import {
    equationSourceFieldId,
    listItemFieldId,
    quoteContentFieldId,
    richTextFieldId,
    tableCellFieldId,
} from "../../fieldIds";
import { parseListItemFieldPath } from "../../listFieldPath";
import { fieldCaretOffsetFromNode, pmPosForFieldCaret } from "../astBridge";
import { listItemPathFromPosition } from "../listPath";
import { locateListItemField } from "../selection";
import type { BodyFocusTarget } from "../selection";

export interface TableCellCoords {
    row: number;
    col: number;
    cellNode: PMNode;
}

const CELL_BLOCK_TYPES = new Set(["paragraph", "quote", "list", "equation"]);

/** Index of the cellblock (paragraph, quote, list, equation) containing the caret. */
export const cellBlockAtSelection = (
    state: EditorState,
): { cell: PMNode; blockIndex: number } | null => {
    if (!tableCellCoordsFromChildState(state)) {
        return null;
    }
    const $head = state.selection.$head;
    for (let depth = $head.depth; depth > 0; depth -= 1) {
        const node = $head.node(depth);
        if (node.type.name === "list_item") {
            continue;
        }
        if (!CELL_BLOCK_TYPES.has(node.type.name)) {
            continue;
        }
        const parent = $head.node(depth - 1);
        if (parent.type.name !== "table_cell") {
            continue;
        }
        return { cell: parent, blockIndex: $head.index(depth - 1) };
    }
    return null;
};

/** Move the caret between cellblock siblings inside one table cell. */
export const arrowBetweenCellBlocks = (direction: 1 | -1): Command => {
    return (state, dispatch, view) => {
        if (!(state.selection instanceof TextSelection) || !state.selection.empty) {
            return false;
        }
        const blockCtx = cellBlockAtSelection(state);
        if (!blockCtx) {
            return false;
        }
        const { cell, blockIndex } = blockCtx;
        const nextIndex = blockIndex + direction;
        if (nextIndex < 0 || nextIndex >= cell.childCount) {
            return false;
        }

        if (view) {
            const atBoundary =
                direction > 0
                    ? view.endOfTextblock("down")
                    : view.endOfTextblock("up");
            if (!atBoundary) {
                return false;
            }
        }

        const $head = state.selection.$head;
        let cellDepth = -1;
        for (let depth = $head.depth; depth > 0; depth -= 1) {
            if ($head.node(depth).type.name === "table_cell") {
                cellDepth = depth;
                break;
            }
        }
        if (cellDepth < 0) {
            return false;
        }

        const cellStart = $head.before(cellDepth);
        let blockPos = cellStart + 1;
        for (let index = 0; index < nextIndex; index += 1) {
            blockPos += cell.child(index).nodeSize;
        }
        const target = cell.child(nextIndex);

        if (target.type.name === "equation") {
            if (dispatch) {
                dispatch(
                    state.tr
                        .setSelection(NodeSelection.create(state.doc, blockPos))
                        .scrollIntoView(),
                );
            }
            return true;
        }

        const bias = direction > 0 ? 1 : -1;
        const $inside = state.doc.resolve(blockPos + 1);
        const nextSel = TextSelection.findFrom($inside, bias, true);
        if (!nextSel) {
            return false;
        }
        if (dispatch) {
            dispatch(state.tr.setSelection(nextSel).scrollIntoView());
        }
        return true;
    };
};

export const defaultFirstCellFocusTarget = (
    doc: PMNode,
    tableId: string,
): BodyFocusTarget => {
    const table = tableNodeInChildDoc(doc);
    if (!table) {
        return {
            elementId: tableId,
            fieldId: tableCellFieldId(tableId, 0, 0),
            caretUtf16Offset: 0,
        };
    }
    const map = TableMap.get(table);
    const cellPos = 1 + map.positionAt(0, 0, table);
    const cellNode = doc.resolve(cellPos).nodeAfter;
    if (!cellNode || cellNode.type.name !== "table_cell") {
        return {
            elementId: tableId,
            fieldId: tableCellFieldId(tableId, 0, 0),
            caretUtf16Offset: 0,
        };
    }
    for (let index = 0; index < cellNode.childCount; index += 1) {
        const block = cellNode.child(index);
        if (block.type.name === "paragraph") {
            return {
                elementId: tableId,
                fieldId: richTextFieldId(block.attrs.elementId as string),
                caretUtf16Offset: 0,
            };
        }
    }
    return {
        elementId: tableId,
        fieldId: tableCellFieldId(tableId, 0, 0),
        caretUtf16Offset: 0,
    };
};

const blockFieldLength = (block: PMNode): number => {
    if (block.type.name === "equation") {
        const element = block.attrs.element as { latex_source?: string } | null;
        return element?.latex_source?.length ?? 0;
    }
    return fieldCaretOffsetFromNode(block, block.content.size);
};

const caretOffsetInBlock = (block: PMNode, $head: ResolvedPos): number => {
    if ($head.parent === block) {
        return fieldCaretOffsetFromNode(block, $head.parentOffset);
    }
    for (let depth = $head.depth; depth > 0; depth -= 1) {
        if ($head.node(depth) === block) {
            return fieldCaretOffsetFromNode(
                block,
                $head.pos - ($head.start(depth) + 1),
            );
        }
    }
    return fieldCaretOffsetFromNode($head.parent, $head.parentOffset);
};

const previewTargetForBlock = (
    tableId: string,
    block: PMNode,
    $head: ResolvedPos,
): BodyFocusTarget => {
    const elementId = block.attrs.elementId as string;
    const caretUtf16Offset = caretOffsetInBlock(block, $head);
    if (block.type.name === "paragraph" || block.type.name === "heading") {
        return {
            elementId: tableId,
            fieldId: richTextFieldId(elementId),
            caretUtf16Offset,
        };
    }
    if (block.type.name === "quote") {
        return {
            elementId,
            fieldId: quoteContentFieldId(elementId),
            caretUtf16Offset,
        };
    }
    if (block.type.name === "list") {
        return {
            elementId,
            fieldId: listItemFieldId(elementId, listItemPathFromPosition($head)),
            caretUtf16Offset,
        };
    }
    if (block.type.name === "equation") {
        const element = block.attrs.element as { id?: string } | null;
        const id = element?.id ?? elementId;
        return {
            elementId: id,
            fieldId: equationSourceFieldId(id),
            caretUtf16Offset,
        };
    }
    return {
        elementId: tableId,
        fieldId: tableCellFieldId(tableId, 0, 0),
        caretUtf16Offset: 0,
    };
};

/** Map nested-table selection to preview-sync field id (matches Typst source map). */
export const tableCellFocusTargetFromState = (
    tableId: string,
    state: EditorState,
): BodyFocusTarget | null => {
    const coords = tableCellCoordsFromChildState(state);
    if (!coords) {
        return null;
    }
    const $head = state.selection.$head;
    for (let depth = $head.depth; depth > 0; depth -= 1) {
        const node = $head.node(depth);
        if (
            node.type.name === "paragraph" ||
            node.type.name === "heading" ||
            node.type.name === "quote" ||
            node.type.name === "list" ||
            node.type.name === "equation"
        ) {
            return previewTargetForBlock(tableId, node, $head);
        }
    }
    return {
        elementId: tableId,
        fieldId: tableCellFieldId(tableId, coords.row, coords.col),
        caretUtf16Offset: 0,
    };
};

const tableNodeInChildDoc = (doc: PMNode): PMNode | null => {
    const table = doc.firstChild;
    return table?.type.name === "table" ? table : null;
};

/**
 * True when the nested-table caret is no longer inside a cell. Arrow navigation
 * at the grid rim (including Ctrl/Cmd+arrow) can land on a whole-table
 * `NodeSelection` or a doc-level caret outside cells; reject those updates so
 * typing does not replace the table.
 */
export const isTableEscapeSelection = (state: EditorState): boolean => {
    if (!tableNodeInChildDoc(state.doc)) {
        return false;
    }
    const sel = state.selection;
    if (sel instanceof NodeSelection && sel.node.type.name === "table") {
        return true;
    }
    return tableCellCoordsFromChildState(state) === null;
};

export const tableCellCoordsFromChildState = (
    state: EditorState,
): TableCellCoords | null => {
    const table = tableNodeInChildDoc(state.doc);
    if (!table) {
        return null;
    }
    const $cell = selectionCell(state);
    if (!$cell) {
        return null;
    }
    const map = TableMap.get(table);
    const tableStart = 1;
    const cellRect = map.findCell($cell.pos - tableStart);
    const cellNode = $cell.node();
    return {
        row: cellRect.top,
        col: cellRect.left,
        cellNode,
    };
};

export const focusTargetForTableCell = (
    tableId: string,
    coords: TableCellCoords,
    state: EditorState,
): BodyFocusTarget =>
    tableCellFocusTargetFromState(tableId, state) ?? {
        elementId: tableId,
        fieldId: tableCellFieldId(tableId, coords.row, coords.col),
        caretUtf16Offset: 0,
    };

export const isTableCellFieldId = (
    fieldId: string | null,
    elementId: string,
): boolean => fieldId?.startsWith(`${elementId}:cell:`) ?? false;

export const parseTableCellFieldId = (
    fieldId: string,
    elementId: string,
): { row: number; col: number } | null => {
    const prefix = `${elementId}:cell:`;
    if (!fieldId.startsWith(prefix)) {
        return null;
    }
    const parts = fieldId.slice(prefix.length).split(":");
    const row = Number(parts[0]);
    const col = Number(parts[1]);
    if (!Number.isFinite(row) || !Number.isFinite(col)) {
        return null;
    }
    return { row, col };
};

const paragraphIdFromRichField = (fieldId: string): string | null =>
    fieldId.endsWith(":text") ? fieldId.slice(0, -":text".length) : null;

const findBlockInCell = (
    cellNode: PMNode,
    fieldId: string | null,
    tableId?: string,
): PMNode | null => {
    if (fieldId && tableId && parseTableCellFieldId(fieldId, tableId)) {
        return cellNode.firstChild ?? null;
    }

    if (!fieldId) {
        return cellNode.firstChild ?? null;
    }

    const paragraphId = paragraphIdFromRichField(fieldId);
    if (paragraphId) {
        let match: PMNode | null = null;
        cellNode.forEach((block) => {
            if (block.attrs.elementId === paragraphId) {
                match = block;
            }
        });
        return match;
    }

    if (fieldId.endsWith(":quote")) {
        const quoteId = fieldId.slice(0, -":quote".length);
        let match: PMNode | null = null;
        cellNode.forEach((block) => {
            if (block.type.name === "quote" && block.attrs.elementId === quoteId) {
                match = block;
            }
        });
        return match;
    }

    const itemMatch = fieldId.match(/^(.+):item:([\d:]+)$/);
    if (itemMatch) {
        const listId = itemMatch[1];
        const path = itemMatch[2].split(":").map(Number);
        let match: PMNode | null = null;
        cellNode.forEach((block) => {
            if (block.type.name === "list" && block.attrs.elementId === listId) {
                match = block;
            }
        });
        if (match && path.length === 1 && match.child(path[0])) {
            return match;
        }
        if (match) {
            return match;
        }
        return null;
    }

    if (fieldId.endsWith(":latexSource")) {
        const equationId = fieldId.slice(0, -":latexSource".length);
        let match: PMNode | null = null;
        cellNode.forEach((block) => {
            if (block.type.name === "equation") {
                const element = block.attrs.element as { id?: string } | null;
                if (element?.id === equationId || block.attrs.elementId === equationId) {
                    match = block;
                }
            }
        });
        return match;
    }

    return null;
};

const cellPmPosForCaret = (cellNode: PMNode, utf16Target: number): number => {
    let utf16 = 0;
    let pos = 0;
    for (let index = 0; index < cellNode.childCount; index += 1) {
        const block = cellNode.child(index);
        const blockLen = blockFieldLength(block);
        if (utf16Target <= utf16 + blockLen) {
            return pos + 1 + pmPosForFieldCaret(block, utf16Target - utf16);
        }
        utf16 += blockLen;
        pos += block.nodeSize;
    }
    return pos + 1;
};

const selectionPosInCell = (
    cellNode: PMNode,
    fieldId: string | null,
    caretUtf16: number,
    tableId?: string,
): number => {
    const block = findBlockInCell(cellNode, fieldId, tableId);
    if (block) {
        let pos = 0;
        for (let index = 0; index < cellNode.childCount; index += 1) {
            const child = cellNode.child(index);
            if (child === block) {
                const listId = block.attrs.elementId as string;
                const itemPath =
                    listId && fieldId
                        ? parseListItemFieldPath(fieldId, listId)
                        : null;
                if (itemPath && block.type.name === "list") {
                    const located = locateListItemField(block, pos + 1, itemPath);
                    if (located) {
                        return (
                            located.contentStart +
                            pmPosForFieldCaret(located.fieldNode, caretUtf16)
                        );
                    }
                }
                return pos + 2 + pmPosForFieldCaret(block, caretUtf16);
            }
            pos += child.nodeSize;
        }
    }
    return cellPmPosForCaret(cellNode, caretUtf16);
};

/** Place the child-table caret at a preview/sidebar focus target. */
export const selectionInChildTableForFocus = (
    doc: PMNode,
    target: BodyFocusTarget,
): TextSelection | null => {
    const parsed = target.fieldId
        ? parseTableCellFieldId(target.fieldId, target.elementId)
        : null;
    if (!parsed && target.fieldId) {
        const located = locateTableCellFromInnerField(doc, target);
        if (located) {
            const offset = selectionPosInCell(
                located.cellNode,
                target.fieldId,
                target.caretUtf16Offset ?? 0,
                target.elementId,
            );
            return TextSelection.create(doc, located.cellPos + offset);
        }
    }
    if (!parsed) {
        return null;
    }
    const table = tableNodeInChildDoc(doc);
    if (!table) {
        return null;
    }
    const map = TableMap.get(table);
    const tableStart = 1;
    const cellPos = tableStart + map.positionAt(parsed.row, parsed.col, table);
    const $cell = doc.resolve(cellPos);
    const cellNode = $cell.nodeAfter ?? $cell.parent;
    if (!cellNode) {
        return null;
    }
    const offset = selectionPosInCell(
        cellNode,
        target.fieldId,
        target.caretUtf16Offset ?? 0,
        target.elementId,
    );
    return TextSelection.create(doc, cellPos + offset);
};

const locateTableCellFromInnerField = (
    doc: PMNode,
    target: BodyFocusTarget,
): { cellNode: PMNode; cellPos: number } | null => {
    if (!target.fieldId) {
        return null;
    }
    const table = tableNodeInChildDoc(doc);
    if (!table) {
        return null;
    }
    const map = TableMap.get(table);
    const tableStart = 1;
    for (let row = 0; row < map.height; row += 1) {
        for (let col = 0; col < map.width; col += 1) {
            const cellPos = tableStart + map.positionAt(row, col, table);
            const cellNode = doc.resolve(cellPos).nodeAfter;
            if (!cellNode || cellNode.type.name !== "table_cell") {
                continue;
            }
            if (findBlockInCell(cellNode, target.fieldId, target.elementId)) {
                return { cellNode, cellPos };
            }
        }
    }
    return null;
};
