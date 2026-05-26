import type { KeyboardEventHandler } from "react";
import { caretPlainOffsetFromSelection } from "../../../../richText/richText";
import { richTextFieldId } from "../../../../editor/fieldIds";
import { insertParagraphAfterElement } from "../../../../editor/insertParagraphAfterElement";
import { paragraphHasText } from "../../../../editor/fieldNavigation";
import { normalizeRichTextContent } from "../../../../editor/textInput";
import { useDeferredRichTextCommit } from "../../../../editor/useDeferredRichTextCommit";
import { useEditorNavigation } from "../../../../editor/EditorNavigationContext";
import { useDocument, useDocumentAst } from "../../../../state/DocumentContext";
import { useEditorFieldBinding } from "../../../../state/EditorFieldRegistry";
import { RichTextField } from "../../../molecules/RichTextField/RichTextField";
import type { ParagraphElement } from "../types";

export const ParagraphEditor = ({ element }: { element: ParagraphElement }) => {
    const { state, dispatch } = useDocumentAst();
    const { setDocumentFocus } = useDocument();
    const { removeContentElement, handleAdvanceKeyDown } = useEditorNavigation();
    const fieldId = richTextFieldId(element.id);
    const { content, setDraft, shouldCommit } = useDeferredRichTextCommit(
        element.id,
        element.content,
    );
    const textField = useEditorFieldBinding<HTMLDivElement>({
        elementId: element.id,
        fieldId,
    });

    const handleEnter = () => {
        if (!paragraphHasText(content)) {
            return;
        }

        insertParagraphAfterElement(
            state,
            dispatch,
            setDocumentFocus,
            element.id,
        );
    };

    const handleBackspaceOnEmpty: KeyboardEventHandler<HTMLDivElement> = (event) => {
        if (event.key !== "Backspace" || paragraphHasText(content)) {
            return;
        }

        const root = event.currentTarget;
        const selection = document.getSelection();
        if (!selection || !root.contains(selection.anchorNode)) {
            return;
        }

        const offset = caretPlainOffsetFromSelection(root, selection);
        if (offset !== 0) {
            return;
        }

        event.preventDefault();
        removeContentElement(state, element.id);
    };

    return (
        <RichTextField
            variant="document"
            content={content}
            fieldBinding={textField}
            onChange={(next) => {
                const normalized = normalizeRichTextContent(next);
                setDraft(normalized);
                if (shouldCommit(normalized)) {
                    dispatch({
                        type: "UPDATE_PARAGRAPH_CONTENT",
                        payload: {
                            paragraphId: element.id,
                            content: next,
                        },
                    });
                }
            }}
            onKeyDown={(event) => {
                if (handleAdvanceKeyDown(event, fieldId)) {
                    return;
                }
                if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey) {
                    event.preventDefault();
                    handleEnter();
                    return;
                }
                handleBackspaceOnEmpty(event);
            }}
        />
    );
};

