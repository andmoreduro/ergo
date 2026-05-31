import type { Node as PMNode } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import type { EditorView, NodeView } from "prosemirror-view";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import { ATOM_BLOCK_NODES } from "../schema";
import { isBlockEditing, setBlockEditing } from "../blockEditMode";
import { clearBlockUiState, setBlockUiState } from "../blockUiState";
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
                    requestAnimationFrame(() => {
                        dom
                            .querySelector<HTMLElement>(
                                "input, textarea, select, button, [contenteditable]",
                            )
                            ?.focus();
                    });
                } else {
                    view.dispatch(
                        view.state.tr.setSelection(
                            NodeSelection.create(view.state.doc, pos),
                        ),
                    );
                    view.focus();
                }
            };

            const onKeyDown = (event: KeyboardEvent) => {
                if (!isBlockEditing(view.state, elementId())) {
                    return;
                }
                // Trap Tab inside the editor so focus never escapes to the
                // ProseMirror view — where the whole block is node-selected and
                // a keystroke would replace it.
                if (event.key === "Tab") {
                    const focusables = Array.from(
                        dom.querySelectorAll<HTMLElement>(
                            "input, textarea, select, button, [contenteditable]",
                        ),
                    ).filter((el) => !el.hasAttribute("disabled"));
                    if (focusables.length > 0) {
                        const active = document.activeElement as HTMLElement | null;
                        const idx = active ? focusables.indexOf(active) : -1;
                        let next = event.shiftKey ? idx - 1 : idx + 1;
                        if (next < 0) {
                            next = focusables.length - 1;
                        }
                        if (next >= focusables.length) {
                            next = 0;
                        }
                        focusables[next].focus();
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                const exit =
                    event.key === "Escape" ||
                    ((event.ctrlKey || event.metaKey) && event.key === "Enter");
                if (!exit) {
                    return;
                }
                const pos = getPos();
                event.preventDefault();
                event.stopPropagation();
                let tr = view.state.tr;
                if (pos !== undefined) {
                    tr = tr.setSelection(NodeSelection.create(view.state.doc, pos));
                }
                tr = setBlockEditing(tr, elementId(), false);
                view.dispatch(tr);
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
