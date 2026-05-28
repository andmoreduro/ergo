import type { KeyboardEventHandler } from "react";
import type { ExtraFieldSpec } from "../../../../bindings/ExtraFieldSpec";
import { elementExtraFieldFieldId } from "../../../../editor/fieldIds";
import { useElementEnterInsertsParagraph } from "../../../../editor/useInsertParagraphAfterElement";
import { normalizeEditableText } from "../../../../editor/textInput";
import { useEditorNavigation } from "../../../../editor/EditorNavigationContext";
import { useEditorFieldBinding } from "../../../../state/EditorFieldRegistry";
import type { WrapperHostElement } from "../../../../editor/wrapperFields";
import { TextInput } from "../../../atoms/TextInput/TextInput";
import { ExtraFieldContentInput } from "./ExtraFieldContentInput";

interface ExtraFieldInputProps {
    element: WrapperHostElement;
    field: ExtraFieldSpec;
    committed: string;
    onDraftChange: (value: string) => void;
    onCommit: (value: string | unknown) => void;
}

export const ExtraFieldInput = ({
    element,
    field,
    committed,
    onDraftChange,
    onCommit,
}: ExtraFieldInputProps) => {
    const elementId = element.id;
    const handleEnterKey = useElementEnterInsertsParagraph(elementId);
    const fieldId = elementExtraFieldFieldId(elementId, field.key);
    const { handleAdvanceKeyDown } = useEditorNavigation();

    const handleChange = (raw: string) => {
        const next = normalizeEditableText(raw);
        onDraftChange(next);
        onCommit(next);
    };

    const handleKeyDown: KeyboardEventHandler<
        HTMLInputElement | HTMLTextAreaElement
    > = (event) => {
        if (handleAdvanceKeyDown(event, fieldId)) {
            return;
        }
        handleEnterKey(event);
    };

    if (field.type === "content") {
        return (
            <ExtraFieldContentInput
                element={element}
                field={field}
                onCommit={onCommit}
            />
        );
    }

    const binding = useEditorFieldBinding<HTMLInputElement>({
        elementId,
        fieldId,
    });

    return (
        <TextInput
            {...binding}
            fullWidth
            label={field.label}
            placeholder={field.label}
            value={committed}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={handleKeyDown}
        />
    );
};

