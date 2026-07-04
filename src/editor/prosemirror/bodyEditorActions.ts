import type { ActionHandlerMap } from "../../actions/runtime";
import type { ActionInvocation } from "../../bindings/ActionInvocation";
import type { ElementType } from "../../commands/editorCommands";
import { tryBodyContentInsert, type BodyEditorInsertDeps } from "../bodyContentInsert";
import {
    getActiveBodyView,
    getActiveTableCellEditor,
    getBodyAstDispatch,
} from "./activeView";
import { selectCurrentElement } from "./bodySelection";
import { enterLockedWholeBlock, runBodyNavigate } from "./bodyTableCommands";
import { handleTableCellBoundaryArrow } from "./table/tableCellBoundary";
import {
    isActiveTableCellEditing,
    TABLE_CELL_FORBIDDEN_ACTION_IDS,
} from "./table/tableCellInsertPolicy";
import {
    moveTableCellSelection,
    runMergeTableCells,
    runSplitTableCell,
    type TableCellDirection,
} from "./table/tableCellNavigation";
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

const NAV_KEY: Record<
    "left" | "right" | "up" | "down",
    "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"
> = {
    left: "ArrowLeft",
    right: "ArrowRight",
    up: "ArrowUp",
    down: "ArrowDown",
};

const withActiveTableCellEditor = (
    run: (view: NonNullable<ReturnType<typeof getActiveTableCellEditor>>) => boolean,
): (() => boolean) => {
    return () => {
        if (!isActiveTableCellEditing()) {
            return false;
        }
        const cellView = getActiveTableCellEditor();
        if (!cellView) {
            return false;
        }
        if (!cellView.hasFocus()) {
            cellView.focus();
        }
        return run(cellView);
    };
};

const withTableCellMove = (direction: TableCellDirection): (() => boolean) =>
    withActiveTableCellEditor((view) => moveTableCellSelection(view, direction));

const withBodyNavigate = (
    direction: "left" | "right" | "up" | "down",
): (() => boolean) => {
    return () => {
        if (isActiveTableCellEditing()) {
            const cellView = getActiveTableCellEditor();
            if (!cellView) {
                return true;
            }
            if (
                handleTableCellBoundaryArrow(cellView, {
                    key: NAV_KEY[direction],
                    altKey: false,
                    ctrlKey: true,
                    metaKey: false,
                    shiftKey: false,
                })
            ) {
                cellView.focus();
                return true;
            }
            return false;
        }
        return withBodyView((view) => runBodyNavigate(view, direction))();
    };
};

const bodyInsertHandler =
    (deps: BodyEditorInsertDeps, elementType: ElementType) =>
    (invocation: ActionInvocation): boolean => {
        if (tryBodyContentInsert(deps, elementType, undefined, invocation.payload)) {
            return true;
        }
        return false;
    };

const insertHandlers = (deps: BodyEditorInsertDeps): ActionHandlerMap => ({
    "editor::InsertParagraph": bodyInsertHandler(deps, "paragraph"),
    "editor::InsertHeading": bodyInsertHandler(deps, "heading"),
    "editor::InsertQuote": bodyInsertHandler(deps, "quote"),
    "editor::InsertList": bodyInsertHandler(deps, "list"),
    "editor::InsertEnumeration": bodyInsertHandler(deps, "enumeration"),
    "editor::InsertTable": bodyInsertHandler(deps, "table"),
    "editor::InsertEquation": bodyInsertHandler(deps, "equation"),
    "editor::InsertBlockEquation": bodyInsertHandler(deps, "equation"),
    "editor::InsertInlineEquation": bodyInsertHandler(deps, "inlineEquation"),
    "editor::InsertFigure": bodyInsertHandler(deps, "figure"),
    "editor::InsertDiagram": bodyInsertHandler(deps, "diagram"),
});

const tableCellForbiddenHandlers = (): ActionHandlerMap => {
    const handlers: ActionHandlerMap = {};
    for (const id of TABLE_CELL_FORBIDDEN_ACTION_IDS) {
        handlers[id] = () => isActiveTableCellEditing();
    }
    return handlers;
};

export const bodyEditorActionHandlers = (
    deps: BodyEditorInsertDeps,
): ActionHandlerMap => ({
    ...insertHandlers(deps),
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
    // editor::Tab is NOT registered here. Body Tab is handled synchronously in
    // the runtime capture phase (runtime.tsx) via runBodyTab, before the async
    // action resolver runs. Registering it here would be dead code — if the
    // capture phase's runBodyTab returned false, re-running it here returns
    // false too. Field-navigation Tab (Ctrl+Shift+Tab / Ctrl+Tab) is handled
    // in the editor context (Editor.tsx), which fires when the body context
    // is not focused.
    "editor::BodyNavigateLeft": withBodyNavigate("left"),
    "editor::BodyNavigateRight": withBodyNavigate("right"),
    "editor::BodyNavigateUp": withBodyNavigate("up"),
    "editor::BodyNavigateDown": withBodyNavigate("down"),
    "editor::MoveTableCellLeft": withTableCellMove("left"),
    "editor::MoveTableCellRight": withTableCellMove("right"),
    "editor::MoveTableCellUp": withTableCellMove("up"),
    "editor::MoveTableCellDown": withTableCellMove("down"),
    "editor::MergeTableCells": withActiveTableCellEditor(runMergeTableCells),
    "editor::SplitTableCell": withActiveTableCellEditor(runSplitTableCell),
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
