import type { Node as PMNode } from "prosemirror-model";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView, type NodeView } from "prosemirror-view";
import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";
import { columnResizing, goToNextCell, tableEditing } from "prosemirror-tables";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import { getBodyTableCommit } from "../activeView";
import { isBlockEditing, setBlockEditing } from "../blockEditMode";
import { clearBlockUiState, setBlockUiState } from "../blockUiState";
import { tableSchema } from "../table/tableSchema";
import { subDocToTable, tableToSubDoc, type TableElement } from "../table/tableSubBridge";
import {
    diffTableElement,
    replaceTableElementEvents,
    tableStructurallySynced,
} from "../tableDiff";
import styles from "./tableBlockNodeView.module.css";
import "./tableBlockNodeView.global.css";

const TABLE_ATTR_SYNC_META = "tableAttrSync";

const tableFromNode = (node: PMNode): TableElement => {
    const element = node.attrs.element as DocumentElement | null;
    if (!element || element.type !== "Table") {
        throw new Error("table_block is missing Table element payload");
    }
    return element;
};

const tableCellKeymap = keymap({
    Tab: goToNextCell(1),
    "Shift-Tab": goToNextCell(-1),
});

const childPlugins = () => [
    tableCellKeymap,
    keymap(
        Object.fromEntries(
            Object.entries(baseKeymap).filter(([key]) => !/^Arrow/.test(key)),
        ),
    ),
    columnResizing({ defaultCellMinWidth: 96 }),
    tableEditing(),
];

/**
 * Block-atom NodeView with an isolated nested table editor (rich-text cells).
 */
export const createTableBlockNodeView = (
    node: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
): NodeView => {
    let currentNode = node;
    let applyingExternalRef = false;

    const dom = document.createElement("div");
    dom.className = styles.block;
    dom.setAttribute("data-pm-nodeview", "table_block");

    const inner = document.createElement("div");
    inner.className = styles.inner;
    dom.appendChild(inner);

    const elementId = () =>
        (currentNode.attrs.elementId as string) ||
        tableFromNode(currentNode).id;

    const syncOuterElementAttr = (nextTable: TableElement) => {
        const pos = getPos();
        if (pos === undefined) {
            return;
        }
        const tr = view.state.tr.setNodeMarkup(pos, undefined, {
            ...currentNode.attrs,
            element: nextTable,
            elementId: nextTable.id,
        });
        tr.setMeta(TABLE_ATTR_SYNC_META, true);
        tr.setMeta("addToHistory", false);
        view.dispatch(tr);
        const updated = view.state.doc.nodeAt(pos);
        if (updated) {
            currentNode = updated;
        }
    };

    const childView = new EditorView(inner, {
        state: EditorState.create({
            doc: tableToSubDoc(tableSchema, tableFromNode(currentNode)),
            plugins: childPlugins(),
        }),
        editable: () => isBlockEditing(view.state, elementId()),
        dispatchTransaction(tr) {
            const next = childView.state.apply(tr);
            childView.updateState(next);

            if (applyingExternalRef || !tr.docChanged) {
                return;
            }

            const prevTable = tableFromNode(currentNode);
            const nextTable = subDocToTable(next.doc, prevTable);
            const bridge = getBodyTableCommit();
            if (!bridge) {
                return;
            }

            const delta = diffTableElement(prevTable, nextTable);
            if (delta && delta.forward.length > 0) {
                bridge.commit(delta.forward, delta.inverse);
                syncOuterElementAttr(nextTable);
                return;
            }

            if (!delta) {
                const index = bridge.elementIndex(prevTable.id);
                if (index < 0) {
                    return;
                }
                const replacement = replaceTableElementEvents(
                    bridge.sectionId,
                    index,
                    prevTable,
                    nextTable,
                );
                bridge.commit(replacement.forward, replacement.inverse);
                syncOuterElementAttr(nextTable);
            }
        },
    });

    const isWholeSelected = (blockPos: number): boolean => {
        const { selection } = view.state;
        return selection instanceof NodeSelection && selection.from === blockPos;
    };

    const pushBlockUi = () => {
        const id = elementId();
        if (!id || !view?.state) {
            return;
        }
        const pos = getPos();
        setBlockUiState(id, {
            selected: pos !== undefined && isWholeSelected(pos),
            editing: isBlockEditing(view.state, id),
        });
    };

    const focusChildAtCoords = (clientX: number, clientY: number) => {
        const hit = childView.posAtCoords({ left: clientX, top: clientY });
        const caret = hit?.pos ?? 1;
        childView.dispatch(
            childView.state.tr.setSelection(
                TextSelection.near(childView.state.doc.resolve(caret), 1),
            ),
        );
        childView.focus();
    };

    const enterEditAtCoords = (blockPos: number, clientX: number, clientY: number) => {
        let tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, blockPos));
        tr = setBlockEditing(tr, elementId(), true);
        view.dispatch(tr);
        childView.setProps({
            editable: () => isBlockEditing(view.state, elementId()),
        });
        requestAnimationFrame(() => focusChildAtCoords(clientX, clientY));
    };

    const onMouseDown = (event: MouseEvent) => {
        if (isBlockEditing(view.state, elementId())) {
            return;
        }
        const blockPos = getPos();
        if (blockPos === undefined) {
            return;
        }
        event.preventDefault();
        if (isWholeSelected(blockPos)) {
            enterEditAtCoords(blockPos, event.clientX, event.clientY);
        } else {
            view.dispatch(
                view.state.tr.setSelection(
                    NodeSelection.create(view.state.doc, blockPos),
                ),
            );
            view.focus();
        }
        pushBlockUi();
    };

    const onKeyDown = (event: KeyboardEvent) => {
        if (!isBlockEditing(view.state, elementId())) {
            return;
        }
        if (event.key === "Escape" || (event.key === "Enter" && event.ctrlKey)) {
            event.preventDefault();
            event.stopPropagation();
            const pos = getPos();
            if (pos === undefined) {
                return;
            }
            let tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos));
            tr = setBlockEditing(tr, elementId(), false);
            view.dispatch(tr);
            childView.setProps({
                editable: () => isBlockEditing(view.state, elementId()),
            });
            view.focus();
            pushBlockUi();
        }
    };

    dom.addEventListener("mousedown", onMouseDown);
    dom.addEventListener("keydown", onKeyDown, true);

    return {
        dom,
        update(updated: PMNode) {
            if (updated.type.name !== "table_block") {
                return false;
            }
            currentNode = updated;
            const incoming = tableFromNode(updated);
            const derived = subDocToTable(childView.state.doc, incoming);
            if (!tableStructurallySynced(derived, incoming)) {
                applyingExternalRef = true;
                try {
                    childView.updateState(
                        EditorState.create({
                            doc: tableToSubDoc(tableSchema, incoming),
                            plugins: childPlugins(),
                            selection: childView.state.selection,
                        }),
                    );
                } finally {
                    applyingExternalRef = false;
                }
            }
            childView.setProps({
                editable: () => isBlockEditing(view.state, elementId()),
            });
            pushBlockUi();
            return true;
        },
        stopEvent(event: Event) {
            if (isBlockEditing(view.state, elementId())) {
                return inner.contains(event.target as globalThis.Node);
            }
            return dom.contains(event.target as globalThis.Node);
        },
        ignoreMutation() {
            return true;
        },
        destroy() {
            dom.removeEventListener("mousedown", onMouseDown);
            dom.removeEventListener("keydown", onKeyDown, true);
            childView.destroy();
            clearBlockUiState(elementId());
        },
    };
};

export { TABLE_ATTR_SYNC_META };
