import { useId } from "react";
import { equationSourceFieldId } from "../../../../editor/fieldIds";
import { useDeferredTextCommit } from "../../../../editor/useDeferredTextCommit";
import { useElementEnterInsertsParagraph } from "../../../../editor/useInsertParagraphAfterElement";
import { normalizeEditableText } from "../../../../editor/textInput";
import { useEditorNavigation } from "../../../../editor/EditorNavigationContext";
import { useDocumentAst } from "../../../../state/DocumentContext";
import { useEditorFieldBinding } from "../../../../state/EditorFieldRegistry";
import { m } from "../../../../paraglide/messages.js";
import { FieldLabel } from "../../../atoms/FieldLabel/FieldLabel";
import { Textarea } from "../../../atoms/Textarea/Textarea";
import { EquationSyntaxField } from "../../../molecules/EquationSyntaxField/EquationSyntaxField";
import { ElementExtrasCollapse } from "../ElementExtrasCollapse";
import { ElementSettingsButton } from "../ElementSettingsButton";
import { useElementSettingsShortcut } from "../useElementSettingsShortcut";
import type { EquationElement } from "../types";
import styles from "./EquationEditor.module.css";

export const EquationEditor = ({ element }: { element: EquationElement }) => {
    const { dispatch } = useDocumentAst();
    const { draft, setDraft, shouldCommit } = useDeferredTextCommit(
        element.latex_source,
    );
    const handleEnterKey = useElementEnterInsertsParagraph(element.id);
    const fieldId = equationSourceFieldId(element.id);
    const sourceInputId = useId();
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const sourceField = useEditorFieldBinding<HTMLTextAreaElement>({
        elementId: element.id,
        fieldId,
    });
    const settings = useElementSettingsShortcut(element.id);

    return (
        <>
            <ElementSettingsButton
                open={settings.open}
                onOpenChange={settings.setOpen}
            >
                <EquationSyntaxField
                    value={element.syntax}
                    onChange={(syntax) =>
                        dispatch({
                            type: "UPDATE_EQUATION",
                            payload: {
                                equationId: element.id,
                                syntax,
                            },
                        })
                    }
                />
            </ElementSettingsButton>
            <ElementExtrasCollapse
                elementId={element.id}
                showToggle={false}
                primary={
                    <div className={styles.field}>
                        <FieldLabel htmlFor={sourceInputId}>
                            {m.editor_equation_source()}
                        </FieldLabel>
                        <div className={styles.sourceRow}>
                            <Textarea
                                {...sourceField}
                                id={sourceInputId}
                                variant="borderless"
                                fullWidth
                                monospace
                                placeholder={m.editor_equation_source()}
                                value={draft}
                                onChange={(event) => {
                                    const next = normalizeEditableText(
                                        event.target.value,
                                    );
                                    setDraft(next);
                                    if (shouldCommit(next)) {
                                        dispatch({
                                            type: "UPDATE_EQUATION",
                                            payload: {
                                                equationId: element.id,
                                                latexSource: next,
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
                    </div>
                }
                extras={null}
            />
        </>
    );
};
