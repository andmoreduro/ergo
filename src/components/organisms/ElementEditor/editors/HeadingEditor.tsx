import { richTextFieldId } from "../../../../editor/fieldIds";
import { useDeferredRichTextCommit } from "../../../../editor/useDeferredRichTextCommit";
import { useElementEnterInsertsParagraph } from "../../../../editor/useInsertParagraphAfterElement";
import { normalizeRichTextContent } from "../../../../editor/textInput";
import { useEditorNavigation } from "../../../../editor/EditorNavigationContext";
import { useDocumentAst } from "../../../../state/DocumentContext";
import { useEditorFieldBinding } from "../../../../state/EditorFieldRegistry";
import { m } from "../../../../paraglide/messages.js";
import { RichTextField } from "../../../molecules/RichTextField/RichTextField";
import { Select } from "../../../atoms/Select/Select";
import type { HeadingElement } from "../types";
import styles from "../ElementEditor.module.css";

const headingLevels = Array.from({ length: 6 }, (_, index) => {
    const level = String(index + 1);
    return { value: level, label: `H${level}` };
});

export const HeadingEditor = ({ element }: { element: HeadingElement }) => {
    const { dispatch } = useDocumentAst();
    const handleEnterKey = useElementEnterInsertsParagraph(element.id);
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const fieldId = richTextFieldId(element.id);
    const { content, setDraft, shouldCommit } = useDeferredRichTextCommit(
        element.id,
        element.content,
    );
    const textField = useEditorFieldBinding<HTMLDivElement>({
        elementId: element.id,
        fieldId,
    });

    return (
        <div className={styles.headingRow}>
            <Select
                variant="inline"
                aria-label={m.editor_heading_level()}
                value={String(element.level)}
                options={headingLevels}
                onChange={(event) =>
                    dispatch({
                        type: "UPDATE_HEADING",
                        payload: {
                            headingId: element.id,
                            level: Number(event.target.value),
                        },
                    })
                }
            />
            <div className={styles.headingText}>
                <RichTextField
                    variant="document"
                    content={content}
                    fieldBinding={textField}
                    onChange={(next) => {
                        const normalized = normalizeRichTextContent(next);
                        setDraft(normalized);
                        if (shouldCommit(normalized)) {
                            dispatch({
                                type: "UPDATE_HEADING_CONTENT",
                                payload: {
                                    headingId: element.id,
                                    content: next,
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
    );
};

