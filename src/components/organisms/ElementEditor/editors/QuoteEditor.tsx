import { quoteContentFieldId } from "../../../../editor/fieldIds";
import { normalizeRichTextContent } from "../../../../editor/textInput";
import { useDeferredRichTextCommit } from "../../../../editor/useDeferredRichTextCommit";
import { useElementEnterInsertsParagraph } from "../../../../editor/useInsertParagraphAfterElement";
import { useEditorNavigation } from "../../../../editor/EditorNavigationContext";
import { useDocumentAst } from "../../../../state/DocumentContext";
import { useEditorFieldBinding } from "../../../../state/EditorFieldRegistry";
import { m } from "../../../../paraglide/messages.js";
import { RichTextField } from "../../../molecules/RichTextField/RichTextField";
import type { QuoteElement } from "../types";
import styles from "../ElementEditor.module.css";

export const QuoteEditor = ({ element }: { element: QuoteElement }) => {
    const { dispatch } = useDocumentAst();
    const handleEnterKey = useElementEnterInsertsParagraph(element.id);
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const fieldId = quoteContentFieldId(element.id);
    const { content, setDraft, shouldCommit } = useDeferredRichTextCommit(
        element.id,
        element.content,
    );
    const fieldBinding = useEditorFieldBinding<HTMLDivElement>({
        elementId: element.id,
        fieldId,
    });

    return (
        <div className={styles.quoteEditor}>
        <RichTextField
            variant="document"
            label={m.editor_quote_content()}
            content={content}
            fieldBinding={fieldBinding}
            onChange={(next) => {
                const normalized = normalizeRichTextContent(next);
                setDraft(normalized);
                if (shouldCommit(normalized)) {
                    dispatch({
                        type: "UPDATE_QUOTE_CONTENT",
                        payload: {
                            quoteId: element.id,
                            content: normalized,
                        },
                    });
                }
            }}
            onKeyDown={(event) => {
                if (handleAdvanceKeyDown(event, fieldId)) {
                    return;
                }
                handleEnterKey(event);
            }}
        />
        </div>
    );
};
