import { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
    tryEnterAdjacentInlineEquation,
    tryEnterInlineEquationVertically,
} from "./inlineEquationFocus";
import {
    tryEnterAdjacentInlineQuote,
} from "./inlineQuoteFocus";

const tryInlineEquationArrow = (
    view: EditorView,
    direction: "left" | "right" | "up" | "down",
): boolean => {
    if (direction === "left") {
        return (
            tryEnterAdjacentInlineEquation(view, "before") ||
            tryEnterAdjacentInlineQuote(view, "before")
        );
    }
    if (direction === "right") {
        return (
            tryEnterAdjacentInlineEquation(view, "after") ||
            tryEnterAdjacentInlineQuote(view, "after")
        );
    }
    return tryEnterInlineEquationVertically(view, direction);
};

export const inlineEquationNavigationPlugin = () =>
    new Plugin({
        props: {
            handleKeyDown(view, event) {
                if (
                    event.altKey ||
                    event.ctrlKey ||
                    event.metaKey ||
                    event.shiftKey
                ) {
                    return false;
                }
                const direction =
                    event.key === "ArrowLeft"
                        ? "left"
                        : event.key === "ArrowRight"
                          ? "right"
                          : event.key === "ArrowUp"
                            ? "up"
                            : event.key === "ArrowDown"
                              ? "down"
                              : null;
                if (!direction) {
                    return false;
                }
                if (tryInlineEquationArrow(view, direction)) {
                    event.preventDefault();
                    return true;
                }
                return false;
            },
        },
    });

export const tryInlineEquationNavigation = (
    view: EditorView,
    direction: "left" | "right" | "up" | "down",
): boolean => tryInlineEquationArrow(view, direction);
