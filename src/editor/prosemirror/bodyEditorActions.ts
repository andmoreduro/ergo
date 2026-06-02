import type { ActionHandlerMap } from "../../actions/runtime";
import {
    getActiveBodyView,
    getBodyAstDispatch,
    peekBodyTabModifiers,
} from "./activeView";
import { runBodyTab } from "./bodyTabCommand";
import { enterLockedWholeBlock, runBodyNavigate } from "./bodyTableCommands";
import { getActiveTableCellCoords } from "./table/tableStructureBridge";

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
    "editor::AddTableRow": () => {
        const coords = getActiveTableCellCoords();
        const dispatch = getBodyAstDispatch();
        if (!coords || !dispatch) {
            return false;
        }
        dispatch({
            type: "ADD_TABLE_ROW",
            payload: { tableId: coords.tableId, rowIndex: coords.row + 1 },
        });
        return true;
    },
    "editor::AddTableColumn": () => {
        const coords = getActiveTableCellCoords();
        const dispatch = getBodyAstDispatch();
        if (!coords || !dispatch) {
            return false;
        }
        dispatch({
            type: "ADD_TABLE_COLUMN",
            payload: { tableId: coords.tableId, colIndex: coords.col + 1 },
        });
        return true;
    },
    "editor::RemoveTableRow": () => {
        const coords = getActiveTableCellCoords();
        const dispatch = getBodyAstDispatch();
        if (!coords || !dispatch) {
            return false;
        }
        dispatch({
            type: "REMOVE_TABLE_ROW",
            payload: { tableId: coords.tableId, rowIndex: coords.row },
        });
        return true;
    },
    "editor::RemoveTableColumn": () => {
        const coords = getActiveTableCellCoords();
        const dispatch = getBodyAstDispatch();
        if (!coords || !dispatch) {
            return false;
        }
        dispatch({
            type: "REMOVE_TABLE_COLUMN",
            payload: { tableId: coords.tableId, colIndex: coords.col },
        });
        return true;
    },
});
