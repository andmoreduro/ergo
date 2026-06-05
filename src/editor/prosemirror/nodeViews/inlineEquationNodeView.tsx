import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { InlineEquationChip } from "./InlineEquationChip";
import type { NodeViewPortalRegistry } from "./nodeViewPortals";

let portalKeySeq = 0;

export const createInlineEquationNodeView = (
    registry: NodeViewPortalRegistry,
    options?: { tableId?: string | null },
) => {
    const tableId = options?.tableId ?? null;

    return (
        node: PMNode,
        view: EditorView,
        getPos: () => number | undefined,
    ): NodeView => {
        let currentNode = node;

        const dom = document.createElement("span");
        dom.className = "ergo-inline-equation-chip";
        dom.contentEditable = "false";

        const key = `inline-equation-${(portalKeySeq += 1)}`;
        const render = () => (
            <InlineEquationChip
                getPos={getPos}
                node={currentNode}
                tableId={tableId}
                view={view}
            />
        );

        registry.register({ key, dom, render });

        return {
            dom,
            update(updatedNode) {
                if (updatedNode.type !== currentNode.type) {
                    return false;
                }
                currentNode = updatedNode;
                registry.update(key, render);
                return true;
            },
            destroy() {
                registry.unregister(key);
            },
            stopEvent(event) {
                return event.target instanceof HTMLInputElement;
            },
            ignoreMutation() {
                return true;
            },
        };
    };
};
