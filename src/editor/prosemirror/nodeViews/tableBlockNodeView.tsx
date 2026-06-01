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
import {
    focusTargetForTableCell,
    selectionInChildTableForFocus,
    tableCellCoordsFromChildState,
} from "../table/tableCellFocus";
import {
    registerTableFocusHandler,
    unregisterTableFocusHandler,
} from "../table/tableFocusRegistry";
import { getTableFocusPush } from "../table/tableFocusBridge";
import { tableSchema } from "../table/tableSchema";
import { subDocToTable, tableToSubDoc, type TableElement } from "../table/tableSubBridge";
import {
    diffTableElement,
    replaceTableElementEvents,
    tableStructurallySynced,
} from "../tableDiff";
import { TableBlockChrome } from "./TableBlockChrome";
import type { NodeViewPortalRegistry } from "./nodeViewPortals";
import styles from "./tableBlockNodeView.module.css";
import "./tableBlockNodeView.global.css";

const TABLE_ATTR_SYNC_META = "tableAttrSync";

let tablePortalKeySeq = 0;

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

export const createTableBlockNodeView = (
    node: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
    registry: NodeViewPortalRegistry,
): NodeView => {
    let currentNode = node;
    let applyingExternalRef = false;
    let wasEditing = isBlockEditing(view.state, tableFromNode(node).id);

    const dom = document.createElement("div");
    dom.className = styles.block;
    dom.setAttribute("data-pm-nodeview", "table_block");

    const inner = document.createElement("div");
    inner.className = styles.inner;
    dom.appendChild(inner);

    const elementId = () =>
        (currentNode.attrs.elementId as string) ||
        tableFromNode(currentNode).id;

    const portalKey = `table-block-${(tablePortalKeySeq += 1)}`;
    registry.register({
        key: portalKey,
        dom,
        render: () => (
            <TableBlockChrome
                elementFromNode={currentNode.attrs.element as TableElement | null}
                elementId={elementId()}
                editing={isBlockEditing(view.state, elementId())}
            />
        ),
    });

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
        registry.update(portalKey, () => (
            <TableBlockChrome
                elementFromNode={nextTable}
                elementId={nextTable.id}
                editing={isBlockEditing(view.state, nextTable.id)}
            />
        ));
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

    const focusChildAtFirstCell = () => {
        const doc = childView.state.doc;
        const selection = selectionInChildTableForFocus(doc, {
            elementId: elementId(),
            fieldId: `${elementId()}:cell:0:0`,
            caretUtf16Offset: 0,
        });
        if (selection) {
            childView.dispatch(childView.state.tr.setSelection(selection));
        }
        childView.focus();
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

            if (!applyingExternalRef && (tr.selectionSet || tr.docChanged)) {
                const push = getTableFocusPush();
                if (push && childView.hasFocus()) {
                    const coords = tableCellCoordsFromChildState(next);
                    if (coords) {
                        const target = focusTargetForTableCell(elementId(), coords);
                        push({
                            elementId: target.elementId,
                            fieldId: target.fieldId,
                            caretUtf16Offset: target.caretUtf16Offset,
                        });
                    }
                }
            }

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

    const applyIncomingFocus = (target: {
        elementId: string;
        fieldId: string | null;
        caretUtf16Offset: number | null;
    }): boolean => {
        const pos = getPos();
        if (pos === undefined || target.elementId !== elementId()) {
            return false;
        }
        let tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos));
        tr = setBlockEditing(tr, elementId(), true);
        view.dispatch(tr);
        childView.setProps({
            editable: () => isBlockEditing(view.state, elementId()),
        });
        const selection = target.fieldId
            ? selectionInChildTableForFocus(childView.state.doc, {
                  elementId: target.elementId,
                  fieldId: target.fieldId,
                  caretUtf16Offset: target.caretUtf16Offset,
              })
            : selectionInChildTableForFocus(childView.state.doc, {
                  elementId: target.elementId,
                  fieldId: `${target.elementId}:cell:0:0`,
                  caretUtf16Offset: 0,
              });
        if (selection) {
            childView.dispatch(childView.state.tr.setSelection(selection));
        }
        childView.focus();
        return true;
    };

    registerTableFocusHandler(elementId(), applyIncomingFocus);

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
        const editing = isBlockEditing(view.state, id);
        setBlockUiState(id, {
            selected: pos !== undefined && isWholeSelected(pos),
            editing,
        });
        registry.update(portalKey, () => (
            <TableBlockChrome
                elementFromNode={currentNode.attrs.element as TableElement | null}
                elementId={id}
                editing={editing}
            />
        ));
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
            const nowEditing = isBlockEditing(view.state, elementId());
            childView.setProps({
                editable: () => nowEditing,
            });
            if (!wasEditing && nowEditing) {
                requestAnimationFrame(() => focusChildAtFirstCell());
            }
            wasEditing = nowEditing;
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
            unregisterTableFocusHandler(elementId());
            childView.destroy();
            clearBlockUiState(elementId());
            registry.unregister(portalKey);
        },
    };
};

export { TABLE_ATTR_SYNC_META };
