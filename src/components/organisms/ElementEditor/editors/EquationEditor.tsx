import { equationSourceFieldId } from "../../../../editor/fieldIds";
import { useDeferredTextCommit } from "../../../../editor/useDeferredTextCommit";
import { useElementEnterInsertsParagraph } from "../../../../editor/useInsertParagraphAfterElement";
import { normalizeEditableText } from "../../../../editor/textInput";
import { useEditorNavigation } from "../../../../editor/EditorNavigationContext";
import { useDocumentAst } from "../../../../state/DocumentContext";
import { useEditorFieldBinding } from "../../../../state/EditorFieldRegistry";
import { m } from "../../../../paraglide/messages.js";
import { Checkbox } from "../../../atoms/Checkbox/Checkbox";
import { Select } from "../../../atoms/Select/Select";
import { Textarea } from "../../../atoms/Textarea/Textarea";
import type { EquationElement } from "../types";

export const EquationEditor = ({ element }: { element: EquationElement }) => {
    const { dispatch } = useDocumentAst();
    const { draft, setDraft, shouldCommit } = useDeferredTextCommit(
        element.latex_source,
    );
    const handleEnterKey = useElementEnterInsertsParagraph(element.id);
    const fieldId = equationSourceFieldId(element.id);
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const sourceField = useEditorFieldBinding<HTMLTextAreaElement>({
        elementId: element.id,
        fieldId,
    });

    return (
        <>
            <Textarea
                {...sourceField}
                fullWidth
                label={m.editor_equation_source()}
                placeholder={m.editor_equation_source()}
                value={draft}
                onChange={(event) => {
                    const next = normalizeEditableText(event.target.value);
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
            <Checkbox
                label={m.editor_equation_block()}
                checked={element.is_block}
                onChange={(event) =>
                    dispatch({
                        type: "UPDATE_EQUATION",
                        payload: {
                            equationId: element.id,
                            isBlock: event.target.checked,
                        },
                    })
                }
            />
            <Select
                fullWidth
                label={m.editor_equation_syntax()}
                value={element.syntax}
                options={[
                    {
                        value: "typst",
                        label: m.editor_equation_syntax_typst(),
                    },
                    {
                        value: "latex",
                        label: m.editor_equation_syntax_latex(),
                    },
                ]}
                onChange={(event) =>
                    dispatch({
                        type: "UPDATE_EQUATION",
                        payload: {
                            equationId: element.id,
                            syntax:
                                event.target.value === "latex" ? "latex" : "typst",
                        },
                    })
                }
            />
        </>
    );
};

