import { pasteImageFigureHandler } from "./handlers/pasteImageFigure";
import type { ClipboardPasteContext, ClipboardPasteHandler } from "./types";

const HANDLERS: ClipboardPasteHandler[] = [pasteImageFigureHandler].toSorted(
    (left, right) => left.priority - right.priority,
);

export const canClipboardPasteHandle = (data: DataTransfer): boolean =>
    HANDLERS.some((handler) => handler.canHandle(data));

export const runClipboardPaste = async (
    ctx: ClipboardPasteContext,
    data: DataTransfer,
): Promise<boolean> => {
    for (const handler of HANDLERS) {
        if (!handler.canHandle(data)) {
            continue;
        }
        if (await handler.handle(ctx, data)) {
            return true;
        }
    }
    return false;
};
