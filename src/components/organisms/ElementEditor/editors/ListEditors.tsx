import type { RichText } from "../../../../bindings/RichText";
import { listItemFieldId } from "../../../../editor/fieldIds";
import { normalizeRichTextContent } from "../../../../editor/textInput";
import { useDeferredRichTextCommit } from "../../../../editor/useDeferredRichTextCommit";
import { useEditorNavigation } from "../../../../editor/EditorNavigationContext";
import { useDocumentAst } from "../../../../state/DocumentContext";
import { createRichText } from "../../../../state/ast/defaults";
import { useEditorFieldBinding } from "../../../../state/EditorFieldRegistry";
import { m } from "../../../../paraglide/messages.js";
import { Button } from "../../../atoms/Button/Button";
import { RichTextField } from "../../../molecules/RichTextField/RichTextField";
import type { EnumerationElement, ListElement } from "../types";
import styles from "../ElementEditor.module.css";

type ListLikeElement = ListElement | EnumerationElement;

const ListItemEditor = ({
    element,
    itemIndex,
    content,
}: {
    element: ListLikeElement;
    itemIndex: number;
    content: RichText[];
}) => {
    const { dispatch } = useDocumentAst();
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const fieldId = listItemFieldId(element.id, itemIndex);
    const {
        content: draftContent,
        setDraft,
        shouldCommit,
    } = useDeferredRichTextCommit(fieldId, content);
    const fieldBinding = useEditorFieldBinding<HTMLDivElement>({
        elementId: element.id,
        fieldId,
    });
    const label =
        element.type === "List"
            ? m.editor_list_item({ index: itemIndex + 1 })
            : m.editor_enumeration_item({ index: itemIndex + 1 });

    return (
        <RichTextField
            label={label}
            content={draftContent}
            fieldBinding={fieldBinding}
            onChange={(next) => {
                const normalized = normalizeRichTextContent(next);
                setDraft(normalized);
                if (!shouldCommit(normalized)) {
                    return;
                }

                if (element.type === "List") {
                    dispatch({
                        type: "UPDATE_LIST_ITEM",
                        payload: {
                            listId: element.id,
                            itemPath: [itemIndex],
                            content: normalized,
                        },
                    });
                    return;
                }

                dispatch({
                    type: "UPDATE_ENUMERATION_ITEM",
                    payload: {
                        enumerationId: element.id,
                        itemPath: [itemIndex],
                        content: normalized,
                    },
                });
            }}
            onKeyDown={(event) => {
                handleAdvanceKeyDown(event, fieldId);
            }}
        />
    );
};

const ListLikeEditor = ({ element }: { element: ListLikeElement }) => {
    const { dispatch } = useDocumentAst();
    const addItem = () => {
        if (element.type === "List") {
            dispatch({
                type: "UPDATE_LIST_ITEM",
                payload: {
                    listId: element.id,
                    itemPath: [element.items.length],
                    content: [createRichText("")],
                },
            });
            return;
        }

        dispatch({
            type: "UPDATE_ENUMERATION_ITEM",
            payload: {
                enumerationId: element.id,
                itemPath: [element.items.length],
                content: [createRichText("")],
            },
        });
    };

    return (
        <div className={styles.listEditor}>
            {element.items.map((item, index) => (
                <ListItemEditor
                    key={`${element.id}-${index}`}
                    element={element}
                    itemIndex={index}
                    content={item.content}
                />
            ))}
            <Button type="button" variant="secondary" size="small" onClick={addItem}>
                {m.editor_add_item({ label: m.editor_array_item() })}
            </Button>
        </div>
    );
};

export const ListEditor = ({ element }: { element: ListElement }) => (
    <ListLikeEditor element={element} />
);

export const EnumerationEditor = ({
    element,
}: {
    element: EnumerationElement;
}) => <ListLikeEditor element={element} />;
