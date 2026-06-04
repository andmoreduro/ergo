import type { DocumentAST } from "../bindings/DocumentAST";
import type { ASTAction } from "./ast/actions";
import { shouldCommitAstAction } from "./ast/commitPolicy";
import { astReducer } from "./ast/reducer";
import {
    createDocumentEventHistoryEntry,
    type DocumentEventHistoryEntry,
} from "./documentEvents";

/**
 * Derives undo/sync events for an `ASTAction`. `astReducer` is used only to
 * supply the post-action shape for event construction (insert indices, table
 * rows, etc.); callers must apply `entry.forwardEvents` via `applyDocumentEvents`.
 */
export function historyEntryForAstAction(
    ast: DocumentAST,
    action: ASTAction,
): DocumentEventHistoryEntry | null {
    if (action.type === "LOAD_DOCUMENT") {
        throw new Error("LOAD_DOCUMENT must not use historyEntryForAstAction");
    }

    const proposedAst = astReducer(ast, action);
    if (!shouldCommitAstAction(ast, action, proposedAst)) {
        return null;
    }

    return createDocumentEventHistoryEntry(ast, action, proposedAst);
}
