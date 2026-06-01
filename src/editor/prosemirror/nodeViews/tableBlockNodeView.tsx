import type { Node as PMNode } from "prosemirror-model";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView, type NodeView } from "prosemirror-view";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import { isBlockEditing, setBlockEditing } from "../blockEditMode";
import { clearBlockUiState, setBlockUiState } from "../blockUiState";
import { tableSchema } from "../table/tableSchema";
import { tableToSubDoc, type TableElement } from "../table/tableSubBridge";
import styles from "./tableBlockNodeView.module.css";
import "./tableBlockNodeView.global.css";

const tableFromNode = (node: PMNode): TableElement => {
    const element = node.attrs.element as DocumentElement | null;
    if (!element || element.type !== "Table") {
        throw new Error("table_block is missing Table element payload");
    }
    return element;
};

/**
 * Block-atom NodeView hosting a read-only (Stage 2) nested table editor.
 * Isolation comes from a separate `contenteditable` tree in the child view.
 */
export const createTableBlockNodeView = (
    node: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
): NodeView => {
    let currentNode = node;

    const dom = document.createElement("div");
    dom.className = styles.block;
    dom.setAttribute("data-pm-nodeview", "table_block");

    const inner = document.createElement("div");
    inner.className = styles.inner;
    dom.appendChild(inner);

    const elementId = () =>
        (currentNode.attrs.elementId as string) ||
        tableFromNode(currentNode).id;

    const childView = new EditorView(inner, {
        state: EditorState.create({
            doc: tableToSubDoc(tableSchema, tableFromNode(currentNode)),
        }),
        editable: () => false,
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
            const nextDoc = tableToSubDoc(tableSchema, tableFromNode(updated));
            childView.updateState(
                EditorState.create({
                    doc: nextDoc,
                    selection: childView.state.selection,
                }),
            );
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
