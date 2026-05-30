import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import { ATOM_BLOCK_NODES } from "../schema";
import { BlockObjectNodeViewHost } from "./BlockObjectNodeViewHost";
import type { NodeViewPortalRegistry } from "./nodeViewPortals";
import styles from "./blockObjectNodeViews.module.css";

/**
 * React NodeViews for block-object elements (equation, figure, diagram, custom).
 * Reuses the existing structured editors and action context from `ElementEditor`.
 *
 * The NodeView only owns its DOM host; the React content is rendered by the host
 * `ProseMirrorBodyEditor` through `registry` (a portal into this DOM), keeping it
 * inside the app's provider tree — see `nodeViewPortals.ts`.
 */
let portalKeySeq = 0;

const renderThunk = (node: PMNode) => () => (
    <BlockObjectNodeViewHost
        elementFromNode={node.attrs.element as DocumentElement | null}
        elementId={(node.attrs.elementId as string) || ""}
    />
);

export const createBlockObjectNodeViews = (
    registry: NodeViewPortalRegistry,
): Record<
    string,
    (node: PMNode, view: EditorView, getPos: () => number | undefined) => NodeView
> => {
    const factories: Record<
        string,
        (node: PMNode, view: EditorView, getPos: () => number | undefined) => NodeView
    > = {};

    for (const name of ATOM_BLOCK_NODES) {
        factories[name] = (node) => {
            const dom = document.createElement("div");
            dom.className = styles.host;
            dom.setAttribute("data-pm-nodeview", name);

            const key = `block-object-${name}-${(portalKeySeq += 1)}`;
            registry.register({ key, dom, render: renderThunk(node) });

            return {
                dom,
                update(updated: PMNode) {
                    if (updated.type.name !== name) {
                        return false;
                    }
                    registry.update(key, renderThunk(updated));
                    return true;
                },
                destroy() {
                    registry.unregister(key);
                },
                stopEvent(event: Event) {
                    return dom.contains(event.target as globalThis.Node);
                },
                ignoreMutation() {
                    return true;
                },
            };
        };
    }

    return factories;
};
