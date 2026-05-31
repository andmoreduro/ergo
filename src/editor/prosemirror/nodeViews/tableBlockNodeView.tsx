import type { Node as PMNode } from "prosemirror-model";
import { NodeSelection, TextSelection } from "prosemirror-state";
import type { EditorView, NodeView } from "prosemirror-view";
import { isBlockEditing, setBlockEditing } from "../blockEditMode";
import styles from "./tableBlockNodeView.module.css";
import "./tableBlockNodeView.global.css";

/**
 * Isolates the table from the outer prose flow. While not in edit mode, pointer
 * and keyboard events do not reach the inner table; the outer doc keeps a gap
 * selection and block highlight instead of a cell selection.
 *
 * Click behaves in two stages: a click on a locked table first selects it as a
 * whole (highlight); a second click — when it is already selected — enters
 * fine-grained mode with the caret at the clicked cell. Once editing, clicks
 * fall through to the native table for normal cell editing.
 */
export const createTableBlockNodeView = (
    node: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
): NodeView => {
    let currentNode = node;

    const dom = document.createElement("div");
    dom.className = styles.block;

    const contentDOM = document.createElement("div");
    contentDOM.className = styles.inner;
    dom.appendChild(contentDOM);

    const elementId = () => currentNode.attrs.elementId as string;

    const isWholeSelected = (blockPos: number): boolean => {
        const { selection } = view.state;
        return selection instanceof NodeSelection && selection.from === blockPos;
    };

    const enterAtCoords = (blockPos: number, clientX: number, clientY: number) => {
        const blockNode = view.state.doc.nodeAt(blockPos);
        if (!blockNode) {
            return;
        }
        const innerFrom = blockPos + 1;
        const innerTo = blockPos + blockNode.nodeSize - 1;
        const hit = view.posAtCoords({ left: clientX, top: clientY });
        const caret = hit
            ? Math.min(Math.max(hit.pos, innerFrom), innerTo)
            : innerFrom;
        let tr = view.state.tr.setSelection(
            TextSelection.near(view.state.doc.resolve(caret), 1),
        );
        tr = setBlockEditing(tr, elementId(), true);
        view.dispatch(tr.scrollIntoView());
        view.focus();
    };

    const onMouseDown = (event: MouseEvent) => {
        // Editing: let the native table handle the click for cell editing.
        if (isBlockEditing(view.state, elementId())) {
            return;
        }
        const blockPos = getPos();
        if (blockPos === undefined) {
            return;
        }
        event.preventDefault();
        if (isWholeSelected(blockPos)) {
            enterAtCoords(blockPos, event.clientX, event.clientY);
        } else {
            view.dispatch(
                view.state.tr.setSelection(
                    NodeSelection.create(view.state.doc, blockPos),
                ),
            );
            view.focus();
        }
    };

    dom.addEventListener("mousedown", onMouseDown);

    return {
        dom,
        contentDOM,
        update(updated: PMNode) {
            if (updated.type.name !== "table_block") {
                return false;
            }
            currentNode = updated;
            return true;
        },
        stopEvent(event: Event) {
            if (isBlockEditing(view.state, elementId())) {
                return false;
            }
            return dom.contains(event.target as globalThis.Node);
        },
        ignoreMutation(record) {
            if (record.type === "selection") {
                return false;
            }
            return !contentDOM.contains(record.target);
        },
        destroy() {
            dom.removeEventListener("mousedown", onMouseDown);
        },
    };
};
