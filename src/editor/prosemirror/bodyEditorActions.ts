import type { ActionHandlerMap } from "../../actions/runtime";
import { getActiveBodyView } from "./activeView";
import { isTableBlockFocused } from "./tableBlockFocus";
import { enterTableFirstCell, runBodyNavigate } from "./bodyTableCommands";

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
    "editor::EnterTable": withBodyView((view) => {
        if (isTableBlockFocused(view.state)) {
            return enterTableFirstCell(view.state, view.dispatch);
        }
        return false;
    }),
    "editor::BodyNavigateLeft": withBodyView((view) => runBodyNavigate(view, "left")),
    "editor::BodyNavigateRight": withBodyView((view) =>
        runBodyNavigate(view, "right"),
    ),
    "editor::BodyNavigateUp": withBodyView((view) => runBodyNavigate(view, "up")),
    "editor::BodyNavigateDown": withBodyView((view) =>
        runBodyNavigate(view, "down"),
    ),
});
