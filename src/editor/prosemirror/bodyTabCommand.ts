import type { EditorView } from "prosemirror-view";

import { ATOM_BLOCK_NODES, TABLE_BLOCK_NODE } from "./schema";

import { blockEditIds, isBlockEditing } from "./blockEditMode";

import { handleWrapperTabKeyDown } from "../wrapperTabCycle";

import { enterLockedWholeBlock } from "./bodyTableCommands";



export interface BodyTabKeyState {
    shiftKey: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
}

const hasChordModifiers = (key: BodyTabKeyState): boolean =>
    Boolean(key.ctrlKey || key.metaKey);



const blockDomForElementId = (

    view: EditorView,

    elementId: string,

): HTMLElement | null => {

    let found: HTMLElement | null = null;

    view.state.doc.descendants((node, pos) => {

        if (found) {

            return false;

        }

        const id =

            (node.attrs.elementId as string) ||

            (node.attrs.element as { id?: string } | null)?.id ||

            "";

        if (id !== elementId) {

            return;

        }

        if (

            node.type.name === TABLE_BLOCK_NODE ||

            ATOM_BLOCK_NODES.has(node.type.name)

        ) {

            const dom = view.nodeDOM(pos);

            if (dom instanceof HTMLElement) {

                found = dom;

            }

        }

    });

    return found;

};



const runWrapperTabCycle = (

    view: EditorView,

    key: BodyTabKeyState,

): boolean => {

    for (const elementId of blockEditIds(view.state)) {

        if (!isBlockEditing(view.state, elementId)) {

            continue;

        }

        const dom = blockDomForElementId(view, elementId);

        if (!dom) {

            continue;

        }

        if (

            handleWrapperTabKeyDown(

                {

                    key: "Tab",

                    shiftKey: key.shiftKey,

                    preventDefault: () => {},

                    stopPropagation: () => {},

                },

                dom,

            )

        ) {

            return true;

        }

    }

    return false;

};



/** Focus is inside a wrapper tab stop of a block currently in fine-grained edit mode. */

export const focusInEditingBlockWrapper = (view: EditorView): boolean => {

    const active = document.activeElement;

    if (!(active instanceof HTMLElement) || !view.dom.contains(active)) {

        return false;

    }

    for (const elementId of blockEditIds(view.state)) {

        if (!isBlockEditing(view.state, elementId)) {

            continue;

        }

        const dom = blockDomForElementId(view, elementId);

        if (dom?.contains(active)) {

            return true;

        }

    }

    return false;

};



/** Tab behavior for the body editor: wrapper field cycle, then enter locked blocks. */

export const runBodyTab = (view: EditorView, key: BodyTabKeyState): boolean => {
    if (hasChordModifiers(key)) {
        return false;
    }

    if (runWrapperTabCycle(view, key)) {

        return true;

    }



    if (focusInEditingBlockWrapper(view)) {

        return false;

    }



    if (key.shiftKey) {

        return false;

    }



    if (!view.hasFocus()) {

        view.focus();

    }

    return enterLockedWholeBlock(view);

};


