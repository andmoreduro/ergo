import type { ActionHandlerMap } from "../../actions/runtime";
import { getActiveBodyView } from "./activeView";
import { runBodyTab } from "./bodyTabCommand";
import { peekBodyTabModifiers } from "./activeView";
import { enterLockedWholeBlock, runBodyNavigate } from "./bodyTableCommands";

const withBodyView = (
    run: (
        view: NonNullable<ReturnType<typeof getActiveBodyView>>,
    ) => boolean,
): (() => boolean) => {
    return () => {
        const view = getActiveBodyView();
        if (!view) {
            return false;
        }
        if (!view.hasFocus()) {
            view.focus();
        }
        return run(view);
    };
};

export const bodyEditorActionHandlers = (): ActionHandlerMap => ({
    "editor::EnterTable": () => {
        const view = getActiveBodyView();
        if (!view) {
            return false;
        }
        return enterLockedWholeBlock(view);
    },
    "editor::Tab": () => {
        const view = getActiveBodyView();
        if (!view) {
            return false;
        }
        const tab = peekBodyTabModifiers();
        return runBodyTab(view, {
            shiftKey: tab.shiftKey,
            ctrlKey: tab.ctrlKey,
            metaKey: tab.metaKey,
        });
    },
    "editor::BodyNavigateLeft": withBodyView((view) => runBodyNavigate(view, "left")),
    "editor::BodyNavigateRight": withBodyView((view) =>
        runBodyNavigate(view, "right"),
    ),
    "editor::BodyNavigateUp": withBodyView((view) => runBodyNavigate(view, "up")),
    "editor::BodyNavigateDown": withBodyView((view) =>
        runBodyNavigate(view, "down"),
    ),
});
