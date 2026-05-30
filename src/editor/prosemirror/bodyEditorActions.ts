import type { ActionHandlerMap } from "../../actions/runtime";
import { getActiveBodyView } from "./activeView";
import { isTableBlockFocused } from "./tableBlockFocus";
import {
    enterTableFirstCell,
    runAltTableCellNavigate,
    runBodyNavigate,
} from "./bodyTableCommands";

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
    "editor::MoveTableCellLeft": withBodyView((view) =>
        runAltTableCellNavigate(view, "ArrowLeft"),
    ),
    "editor::MoveTableCellRight": withBodyView((view) =>
        runAltTableCellNavigate(view, "ArrowRight"),
    ),
    "editor::MoveTableCellUp": withBodyView((view) =>
        runAltTableCellNavigate(view, "ArrowUp"),
    ),
    "editor::MoveTableCellDown": withBodyView((view) =>
        runAltTableCellNavigate(view, "ArrowDown"),
    ),
    "editor::EnterTable": withBodyView((view) => {
        if (isTableBlockFocused(view.state)) {
            return enterTableFirstCell(view.state, view.dispatch);
        }
        return false;
    }),
    // Arrow keys are handled synchronously in `bodyKeyboardPlugin` (not keymap-bound).
    "editor::BodyNavigateLeft": withBodyView((view) => runBodyNavigate(view, "left")),
    "editor::BodyNavigateRight": withBodyView((view) =>
        runBodyNavigate(view, "right"),
    ),
    "editor::BodyNavigateUp": withBodyView((view) => runBodyNavigate(view, "up")),
    "editor::BodyNavigateDown": withBodyView((view) =>
        runBodyNavigate(view, "down"),
    ),
});
