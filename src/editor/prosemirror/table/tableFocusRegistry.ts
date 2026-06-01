import type { BodyFocusTarget } from "../selection";

export type TableFocusHandler = (target: BodyFocusTarget) => boolean;

const handlers = new Map<string, TableFocusHandler>();

export const registerTableFocusHandler = (
    elementId: string,
    handler: TableFocusHandler,
): void => {
    handlers.set(elementId, handler);
};

export const unregisterTableFocusHandler = (elementId: string): void => {
    handlers.delete(elementId);
};

export const applyTableCellFocus = (target: BodyFocusTarget): boolean => {
    const handler = handlers.get(target.elementId);
    return handler?.(target) ?? false;
};
