import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { isTableEditing } from "../tableEditMode";
import styles from "./tableBlockNodeView.module.css";
import "./tableBlockNodeView.global.css";

/**
 * Isolates the table from the outer prose flow. While not in edit mode, pointer
 * and keyboard events do not reach the inner table; the outer doc keeps a gap
 * selection and block highlight instead of a cell selection.
 */
export const createTableBlockNodeView = (
    node: PMNode,
    view: EditorView,
    _getPos: () => number | undefined,
): NodeView => {
    let currentNode = node;

    const dom = document.createElement("div");
    dom.className = styles.block;

    const contentDOM = document.createElement("div");
    contentDOM.className = styles.inner;
    dom.appendChild(contentDOM);

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
            const elementId = currentNode.attrs.elementId as string;
            if (isTableEditing(view.state, elementId)) {
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
    };
};
