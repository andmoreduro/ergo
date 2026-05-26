import { elementExtraFieldFieldId } from "../../../../editor/fieldIds";
import { useDeferredTextCommit } from "../../../../editor/useDeferredTextCommit";
import { useElementEnterInsertsParagraph } from "../../../../editor/useInsertParagraphAfterElement";
import { normalizeEditableText } from "../../../../editor/textInput";
import { useEditorNavigation } from "../../../../editor/EditorNavigationContext";
import { useEditorFieldBinding } from "../../../../state/EditorFieldRegistry";
import type { useDocumentAst } from "../../../../state/DocumentContext";
import { Textarea } from "../../../atoms/Textarea/Textarea";

export const CustomElementFieldInput = ({
    elementId,
    fieldKey,
    label,
    committed,
    dispatch,
}: {
    elementId: string;
    fieldKey: string;
    label: string;
    committed: string;
    dispatch: ReturnType<typeof useDocumentAst>["dispatch"];
}) => {
    const { draft, setDraft, shouldCommit } = useDeferredTextCommit(committed);
    const handleEnterKey = useElementEnterInsertsParagraph(elementId);
    const fieldId = elementExtraFieldFieldId(elementId, fieldKey);
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const binding = useEditorFieldBinding<HTMLTextAreaElement>({
        elementId,
        fieldId,
    });

    return (
        <Textarea
            {...binding}
            fullWidth
            label={label}
            placeholder={label}
            value={draft}
            onKeyDown={(event) => {
                if (handleAdvanceKeyDown(event, fieldId)) {
                    return;
                }
                handleEnterKey(event);
            }}
            onChange={(event) => {
                const next = normalizeEditableText(event.target.value);
                setDraft(next);
                if (shouldCommit(next)) {
                    dispatch({
                        type: "UPDATE_CUSTOM_ELEMENT_FIELD",
                        payload: {
                            elementId,
                            field: fieldKey,
                            value: next,
                        },
                    });
                }
            }}
        />
    );
};

