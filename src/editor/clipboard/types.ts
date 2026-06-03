import type { DocumentAST } from "../../bindings/DocumentAST";
import type { TemplateSpec } from "../../bindings/TemplateSpec";
import type { ASTAction } from "../../state/ast/actions";
import type { DocumentFocusInput } from "../../state/DocumentContext";

export type ClipboardPasteContext = {
    ast: DocumentAST;
    anchorElementId: string | null;
    templateSpec: TemplateSpec | null;
    dispatch: (action: ASTAction) => void;
    setDocumentFocus: (focus: DocumentFocusInput) => void;
};

export type ClipboardPasteHandler = {
    /** Lower numbers run first; the first handler that returns true stops the chain. */
    priority: number;
    canHandle: (data: DataTransfer) => boolean;
    handle: (ctx: ClipboardPasteContext, data: DataTransfer) => Promise<boolean>;
};
