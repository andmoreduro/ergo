import type { ActionHandlerMap } from "../../actions/runtime";
import type { ActionInvocation } from "../../bindings/ActionInvocation";
import type { ElementType } from "../../commands/editorCommands";
import { tryBodyContentInsert } from "../bodyContentInsert";
import {
    getActiveBodyView,
    getBodyAstDispatch,
    peekBodyTabModifiers,
} from "./activeView";
import { selectCurrentElement } from "./bodySelection";
import { runBodyTab } from "./bodyTabCommand";
import { enterLockedWholeBlock, runBodyNavigate } from "./bodyTableCommands";
import {
    isActiveTableCellEditing,
    TABLE_CELL_FORBIDDEN_ACTION_IDS,
} from "./table/tableCellInsertPolicy";
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

const bodyInsertHandler =
    (elementType: ElementType) =>
    (invocation: ActionInvocation): boolean => {
        if (tryBodyContentInsert(elementType, undefined, invocation.payload)) {
            return true;
        }
        return false;
    };

const insertHandlers = (): ActionHandlerMap => ({
    "editor::InsertParagraph": bodyInsertHandler("paragraph"),
    "editor::InsertHeading": bodyInsertHandler("heading"),
    "editor::InsertQuote": bodyInsertHandler("quote"),
    "editor::InsertList": bodyInsertHandler("list"),
    "editor::InsertEnumeration": bodyInsertHandler("enumeration"),
    "editor::InsertTable": bodyInsertHandler("table"),
    "editor::InsertEquation": bodyInsertHandler("equation"),
    "editor::InsertBlockEquation": bodyInsertHandler("equation"),
    "editor::InsertInlineEquation": bodyInsertHandler("inlineEquation"),
    "editor::InsertFigure": bodyInsertHandler("figure"),
    "editor::InsertDiagram": bodyInsertHandler("diagram"),
});

const tableCellForbiddenHandlers = (): ActionHandlerMap => {
    const handlers: ActionHandlerMap = {};
    for (const id of TABLE_CELL_FORBIDDEN_ACTION_IDS) {
        handlers[id] = () => isActiveTableCellEditing();
    }
    return handlers;
};

export const bodyEditorActionHandlers = (): ActionHandlerMap => ({
    ...insertHandlers(),
    ...tableCellForbiddenHandlers(),
    "editor::SelectCurrentElement": withBodyView((view) =>
        selectCurrentElement(view.state, view.dispatch.bind(view)),
    ),
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
