import type { Node as PMNode } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import type { EditorView, NodeView } from "prosemirror-view";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import { ATOM_BLOCK_NODES, TABLE_BLOCK_NODE } from "../schema";
import { isBlockEditing, setBlockEditing } from "../blockEditMode";
import { clearBlockUiState, setBlockUiState } from "../blockUiState";
import { blurFocusedInside, focusWrapperPrimary } from "../../wrapperTabCycle";
import { runBodyTab } from "../bodyTabCommand";
import { BlockObjectNodeViewHost } from "./BlockObjectNodeViewHost";
import type { NodeViewPortalRegistry } from "./nodeViewPortals";
import styles from "./blockObjectNodeViews.module.css";
import "./blockObjectNodeViews.global.css";

/**
 * React NodeViews for block-object elements (equation, figure, diagram, custom).
 * Reuses the existing structured editors and action context from `ElementEditor`.
 *
 * The NodeView only owns its DOM host; the React content is rendered by the host
 * `ProseMirrorBodyEditor` through `registry` (a portal into this DOM), keeping it
 * inside the app's provider tree — see `nodeViewPortals.ts`.
 *
 * Atoms share the block locked ↔ fine-grained model: while locked the inner
 * editor is inert (the `--locked` decoration class disables pointer events on the
 * portal content) and a first click selects the whole block, a second click
 * enters fine-grained mode. `Esc` / `Ctrl+Enter` while editing returns to the
 * locked state.
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
        if (name === TABLE_BLOCK_NODE) {
            continue;
        }
        factories[name] = (node, view, getPos) => {
            let currentNode = node;

            const dom = document.createElement("div");
            dom.className = styles.host;
            dom.setAttribute("data-pm-nodeview", name);

            const elementId = (): string =>
                (currentNode.attrs.elementId as string) ||
                (currentNode.attrs.element as DocumentElement | null)?.id ||
                "";

            const key = `block-object-${name}-${(portalKeySeq += 1)}`;
            registry.register({ key, dom, render: renderThunk(node) });

            const isWholeSelected = (pos: number): boolean => {
                const { selection } = view.state;
                return (
                    selection instanceof NodeSelection && selection.from === pos
                );
            };

            // Publish selected/editing across the portal boundary so the React
            // editor can keep its extras revealed while the block is focused.
            const pushBlockUi = () => {
                const id = elementId();
                // `view` (or its state) is absent in unit tests that construct
                // the NodeView with a stub view; nothing to publish then.
                if (!id || !view?.state) {
                    return;
                }
                const pos = getPos();
                setBlockUiState(id, {
                    selected: pos !== undefined && isWholeSelected(pos),
                    editing: isBlockEditing(view.state, id),
                });
            };

            const onMouseDown = (event: MouseEvent) => {
                // Editing: let the embedded React editor handle the click.
                if (isBlockEditing(view.state, elementId())) {
                    return;
                }
                const pos = getPos();
                if (pos === undefined) {
                    return;
                }
                event.preventDefault();
                if (isWholeSelected(pos)) {
                    let tr = view.state.tr.setSelection(
                        NodeSelection.create(view.state.doc, pos),
                    );
                    tr = setBlockEditing(tr, elementId(), true);
                    view.dispatch(tr);
                    focusWrapperPrimary(dom);
                } else {
                    blurFocusedInside(dom);
                    view.dispatch(
                        view.state.tr.setSelection(
                            NodeSelection.create(view.state.doc, pos),
                        ),
                    );
                    view.focus();
                }
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
                const pos = getPos();
                const mod = event.ctrlKey || event.metaKey;
                if (
                    !isBlockEditing(view.state, elementId()) &&
                    mod &&
                    event.key === "Enter" &&
                    pos !== undefined &&
                    isWholeSelected(pos)
                ) {
                    event.preventDefault();
                    event.stopPropagation();
                    let tr = view.state.tr.setSelection(
                        NodeSelection.create(view.state.doc, pos),
                    );
                    tr = setBlockEditing(tr, elementId(), true);
                    view.dispatch(tr);
                    focusWrapperPrimary(dom);
                    return;
                }
                if (!isBlockEditing(view.state, elementId())) {
                    return;
                }
                const exit =
                    event.key === "Escape" ||
                    ((event.ctrlKey || event.metaKey) && event.key === "Enter");
                if (!exit) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                const exitPos = getPos();
                let tr = view.state.tr;
                if (exitPos !== undefined) {
                    tr = tr.setSelection(NodeSelection.create(view.state.doc, exitPos));
                }
                tr = setBlockEditing(tr, elementId(), false);
                view.dispatch(tr);
                blurFocusedInside(dom);
                view.focus();
            };

            dom.addEventListener("mousedown", onMouseDown);
            dom.addEventListener("keydown", onKeyDown, true);

            pushBlockUi();

            return {
                dom,
                update(updated: PMNode) {
                    if (updated.type.name !== name) {
                        return false;
                    }
                    currentNode = updated;
                    registry.update(key, renderThunk(updated));
                    // Selection / edit-mode changes reach this node as decoration
                    // updates, so recompute the bridged UI state here.
                    pushBlockUi();
                    return true;
                },
                destroy() {
                    dom.removeEventListener("mousedown", onMouseDown);
                    dom.removeEventListener("keydown", onKeyDown, true);
                    clearBlockUiState(elementId());
                    registry.unregister(key);
                },
                stopEvent(event: Event) {
                    if (!isBlockEditing(view.state, elementId())) {
                        return false;
                    }
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
