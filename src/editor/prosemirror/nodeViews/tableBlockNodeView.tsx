import type { Node as PMNode } from "prosemirror-model";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView, type NodeView } from "prosemirror-view";
import { keymap } from "prosemirror-keymap";
import {
    baseKeymap,
    chainCommands,
    splitBlock,
    toggleMark,
} from "prosemirror-commands";
import { deleteEmptyListItem, splitListItem } from "../listEnter";
import { columnResizing, tableEditing } from "prosemirror-tables";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import { runBodyTab } from "../bodyTabCommand";
import { getBodyTableCommit, setActiveTableCellEditor } from "../activeView";
import {
    absorbSettingsChromePointerDown,
    isSettingsChromeTarget,
} from "../blockWholeSelection";
import { isBlockEditing, setBlockEditing } from "../blockEditMode";
import { clearBlockUiState, setBlockUiState } from "../blockUiState";
import {
    arrowBetweenCellBlocks,
    defaultFirstCellFocusTarget,
    isTableEscapeSelection,
    selectionInChildTableForFocus,
    tableCellCoordsFromChildState,
    tableCellFocusTargetFromState,
} from "../table/tableCellFocus";
import {
    registerTableFocusHandler,
    unregisterTableFocusHandler,
} from "../table/tableFocusRegistry";
import { getTableFocusPush } from "../table/tableFocusBridge";
import { setActiveTableCellCoords } from "../table/tableStructureBridge";
import { tableCellBoundaryPlugin } from "../table/tableCellBoundary";
import { findPlugin } from "../../find/prosemirrorFindPlugin";
import { textMarkStatePlugin } from "../textMarkStatePlugin";
import { tableSchema } from "../table/tableSchema";
import { subDocToTable, tableToSubDoc, type TableElement } from "../table/tableSubBridge";
import {
    diffTableElement,
    replaceTableElementEvents,
    tableStructurallySynced,
} from "../tableDiff";
import {
    TableBlockChromeCoordinator,
    TableBlockSettingsCoordinator,
} from "./TableBlockChrome";
import type { NodeViewPortalRegistry } from "./nodeViewPortals";
import elementStyles from "../../../components/organisms/ElementEditor/ElementEditor.module.css";
import { inlineEquationNavigationPlugin } from "../inlineEquationPlugin";
import { createInlineEquationNodeView } from "./inlineEquationNodeView";
import { createInlineQuoteNodeView } from "./inlineQuoteNodeView";
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

/** List-aware Enter/Backspace inside a table cell. */
const tableCellListKeymap = keymap({
    Enter: chainCommands(splitListItem, splitBlock),
    Backspace: chainCommands(deleteEmptyListItem, baseKeymap.Backspace),
    "Shift-Enter": (state, dispatch) => {
        const type = tableSchema.nodes.hard_break;
        if (!type || !dispatch) {
            return false;
        }
        dispatch(state.tr.replaceSelectionWith(type.create()).scrollIntoView());
        return true;
    },
});

const swallowTabKeymap = keymap({
    Tab: () => true,
    "Shift-Tab": () => true,
});

const childNavigationKeymap = keymap({
    ArrowUp: arrowBetweenCellBlocks(-1),
    ArrowDown: arrowBetweenCellBlocks(1),
});

const childPlugins = () => [
    inlineEquationNavigationPlugin(),
    keymap({
        ...Object.fromEntries(
            Object.entries(baseKeymap).filter(([key]) => {
                if (/^(Mod-|Ctrl-|Alt-)/.test(key)) {
                    return true;
                }
                return (
                    !/^(Arrow(?:Up|Down|Left|Right))$/.test(key) &&
                    key !== "Enter" &&
                    key !== "Backspace"
                );
            }),
        ),
        "Mod-u": toggleMark(tableSchema.marks.underline),
    }),
    childNavigationKeymap,
    columnResizing({ defaultCellMinWidth: 96 }),
    tableEditing(),
    tableCellListKeymap,
    swallowTabKeymap,
    tableCellBoundaryPlugin(),
    findPlugin(),
    textMarkStatePlugin(),
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

    const shell = document.createElement("div");
    shell.className = elementStyles.extrasShell;

    const primaryWrap = document.createElement("div");
    primaryWrap.className = `${elementStyles.extrasPrimary} ${elementStyles.elementPrimary}`;
    primaryWrap.setAttribute("data-wrapper-tab", "primary");

    const inner = document.createElement("div");
    inner.className = styles.inner;
    inner.setAttribute("data-table-inner", "");

    const settingsMount = document.createElement("div");
    settingsMount.className = styles.settingsMount;
    const shieldSettingsBubble = (event: Event) => {
        if (!isSettingsChromeTarget(event.target)) {
            return;
        }
        event.stopPropagation();
    };
    settingsMount.addEventListener("pointerdown", shieldSettingsBubble);
    settingsMount.addEventListener("mousedown", shieldSettingsBubble);

    const chromeMount = document.createElement("div");
    const coordinatorMount = document.createElement("div");
    coordinatorMount.hidden = true;

    primaryWrap.appendChild(settingsMount);
    primaryWrap.appendChild(inner);
    shell.appendChild(primaryWrap);
    shell.appendChild(chromeMount);
    dom.appendChild(shell);
    dom.appendChild(coordinatorMount);

    const shellRef = { current: shell as HTMLDivElement };

    const elementId = () =>
        (currentNode.attrs.elementId as string) ||
        tableFromNode(currentNode).id;

    const portalKey = `table-block-${(tablePortalKeySeq += 1)}`;

    const renderCoordinator = () => (
        <>
            <TableBlockSettingsCoordinator
                elementFromNode={currentNode.attrs.element as TableElement | null}
                elementId={elementId()}
                settingsMount={settingsMount}
            />
            <TableBlockChromeCoordinator
                elementFromNode={currentNode.attrs.element as TableElement | null}
                elementId={elementId()}
                chromeMount={chromeMount}
                shellRef={shellRef}
            />
        </>
    );

    registry.register({
        key: portalKey,
        dom: coordinatorMount,
        render: renderCoordinator,
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
        registry.update(portalKey, renderCoordinator);
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
        const target = defaultFirstCellFocusTarget(doc, elementId());
        const selection = selectionInChildTableForFocus(doc, target);
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
        nodeViews: {
            inlineEquation: createInlineEquationNodeView(registry, {
                tableId: elementId(),
            }),
            inlineQuote: createInlineQuoteNodeView(registry, {
                tableId: elementId(),
            }),
        },
        editable: () => isBlockEditing(view.state, elementId()),
        dispatchTransaction(tr) {
            const next = childView.state.apply(tr);

            // Arrow navigation off the table's outer edge escapes the cells onto
            // a NodeSelection of the whole table (or a doc-level caret outside
            // cells). Keep the previous in-cell selection — exiting to a body
            // NodeSelection would let the next keystroke replace the table.
            if (
                !applyingExternalRef &&
                tr.selectionSet &&
                !tr.docChanged &&
                isTableEscapeSelection(next)
            ) {
                return;
            }

            childView.updateState(next);

            if (!applyingExternalRef && (tr.selectionSet || tr.docChanged)) {
                const push = getTableFocusPush();
                if (push && childView.hasFocus()) {
                    const coords = tableCellCoordsFromChildState(next);
                    if (coords) {
                        setActiveTableCellEditor(childView);
                        setActiveTableCellCoords({
                            tableId: elementId(),
                            row: coords.row,
                            col: coords.col,
                        });
                        const target = tableCellFocusTargetFromState(
                            elementId(),
                            next,
                        );
                        if (target) {
                            push({
                                elementId: target.elementId,
                                fieldId: target.fieldId,
                                caretUtf16Offset: target.caretUtf16Offset,
                            });
                        }
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
            : selectionInChildTableForFocus(
                  childView.state.doc,
                  defaultFirstCellFocusTarget(childView.state.doc, target.elementId),
              );
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
        registry.update(portalKey, renderCoordinator);
    };

    /** Re-lock the table as a whole block and hand focus back to the body view. */
    const exitToLockedWholeBlock = () => {
        const pos = getPos();
        if (pos === undefined) {
            return;
        }
        let tr = view.state.tr.setSelection(
            NodeSelection.create(view.state.doc, pos),
        );
        tr = setBlockEditing(tr, elementId(), false);
        view.dispatch(tr);
        setActiveTableCellCoords(null);
        childView.setProps({
            editable: () => isBlockEditing(view.state, elementId()),
        });
        view.focus();
        pushBlockUi();
    };

    const enterEditAtCoords = (
        blockPos: number,
        coords?: { clientX: number; clientY: number },
    ) => {
        let tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, blockPos));
        tr = setBlockEditing(tr, elementId(), true);
        view.dispatch(tr);
        childView.setProps({
            editable: () => isBlockEditing(view.state, elementId()),
        });
        requestAnimationFrame(() => {
            if (coords) {
                focusChildAtCoords(coords.clientX, coords.clientY);
            } else {
                focusChildAtFirstCell();
            }
        });
    };

    const onMouseDown = (event: MouseEvent) => {
        const blockPos = getPos();
        if (
            absorbSettingsChromePointerDown(view, event)
        ) {
            pushBlockUi();
            return;
        }
        const target = event.target as globalThis.Node | null;
        if (target && chromeMount.contains(target)) {
            return;
        }
        if (isBlockEditing(view.state, elementId())) {
            return;
        }
        if (blockPos === undefined) {
            return;
        }
        event.preventDefault();
        if (isWholeSelected(blockPos)) {
            enterEditAtCoords(blockPos, {
                clientX: event.clientX,
                clientY: event.clientY,
            });
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
        if (event.key === "Tab") {
            event.preventDefault();
            event.stopPropagation();
            runBodyTab(view, {
                shiftKey: event.shiftKey,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
            });
            return;
        }
        const blockPos = getPos();
        const mod = event.ctrlKey || event.metaKey;
        if (
            !isBlockEditing(view.state, elementId()) &&
            mod &&
            event.key === "Enter" &&
            blockPos !== undefined &&
            isWholeSelected(blockPos)
        ) {
            event.preventDefault();
            event.stopPropagation();
            enterEditAtCoords(blockPos);
            return;
        }
        if (!isBlockEditing(view.state, elementId())) {
            return;
        }
        if (event.key === "Escape" || (event.key === "Enter" && event.ctrlKey)) {
            event.preventDefault();
            event.stopPropagation();
            exitToLockedWholeBlock();
        }
    };

    dom.addEventListener("mousedown", onMouseDown);
    dom.addEventListener("keydown", onKeyDown, true);

    pushBlockUi();

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
            if (isSettingsChromeTarget(event.target)) {
                return true;
            }
            if (!isBlockEditing(view.state, elementId())) {
                return false;
            }
            const target = event.target as globalThis.Node | null;
            if (target && chromeMount.contains(target)) {
                return true;
            }
            return inner.contains(target);
        },
        ignoreMutation() {
            return true;
        },
        destroy() {
            settingsMount.removeEventListener("pointerdown", shieldSettingsBubble);
            settingsMount.removeEventListener("mousedown", shieldSettingsBubble);
            dom.removeEventListener("mousedown", onMouseDown);
            dom.removeEventListener("keydown", onKeyDown, true);
            unregisterTableFocusHandler(elementId());
            setActiveTableCellCoords(null);
            setActiveTableCellEditor(null);
            childView.destroy();
            clearBlockUiState(elementId());
            registry.unregister(portalKey);
        },
    };
};

export { TABLE_ATTR_SYNC_META };
