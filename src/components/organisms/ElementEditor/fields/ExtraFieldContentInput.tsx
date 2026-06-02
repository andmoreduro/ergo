import type { KeyboardEventHandler } from "react";
import type { ExtraFieldSpec } from "../../../../bindings/ExtraFieldSpec";
import { elementAnnotationFieldId } from "../../../../editor/fieldIds";
import { parseInputRichText } from "../../../../editor/richTextMarks";
import { useElementEnterInsertsParagraph } from "../../../../editor/useInsertParagraphAfterElement";
import { normalizeRichTextContent } from "../../../../editor/textInput";
import { useDeferredRichTextCommit } from "../../../../editor/useDeferredRichTextCommit";
import { useEditorNavigation } from "../../../../editor/EditorNavigationContext";
import { useEditorFieldBinding } from "../../../../state/EditorFieldRegistry";
import type { WrapperHostElement } from "../../../../editor/wrapperFields";
import { wrapperFieldValue } from "../../../../editor/wrapperFields";
import { RichTextField } from "../../../molecules/RichTextField/RichTextField";

interface ExtraFieldContentInputProps {
    element: WrapperHostElement;
    field: ExtraFieldSpec;
    onCommit: (value: unknown) => void;
}

export const ExtraFieldContentInput = ({
    element,
    field,
    onCommit,
}: ExtraFieldContentInputProps) => {
    const elementId = element.id;
    const handleEnterKey = useElementEnterInsertsParagraph(elementId);
    const fieldId = elementAnnotationFieldId(elementId, element.type, field.key);
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const committed = parseInputRichText(wrapperFieldValue(element, field.key));
    const { content, setDraft, shouldCommit } = useDeferredRichTextCommit(
        `${elementId}:${field.key}`,
        committed,
    );
    const fieldBinding = useEditorFieldBinding<HTMLDivElement>({
        elementId,
        fieldId,
    });

    const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
        if (handleAdvanceKeyDown(event, fieldId)) {
            return;
        }
        handleEnterKey(event);
    };

    return (
        <RichTextField
            label={field.label}
            content={content}
            fieldBinding={fieldBinding}
            onChange={(next) => {
                const normalized = normalizeRichTextContent(next);
                setDraft(normalized);
                if (shouldCommit(normalized)) {
                    onCommit(normalized);
                }
            }}
            onKeyDown={handleKeyDown}
        />
    );
};
