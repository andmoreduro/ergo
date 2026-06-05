import { useCallback } from "react";
import type { InputSchema } from "../../../bindings/InputSchema";
import { Checkbox } from "../../atoms/Checkbox/Checkbox";
import { InputEntryAddButton } from "../InputEntryControls/InputEntryAddButton";
import { InputEntryRemoveButton } from "../InputEntryControls/InputEntryRemoveButton";
import { FieldLabel } from "../../atoms/FieldLabel/FieldLabel";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { useEditorFieldBinding } from "../../../state/EditorFieldRegistry";
import { useDocumentAst } from "../../../state/DocumentContext";
import {
    projectInputElementId,
    projectInputFieldId,
} from "../../../editor/fieldIds";
import { normalizeEditableText } from "../../../editor/textInput";
import { inputRichTextPlain } from "../../../editor/richTextMarks";
import { useDeferredTextCommit } from "../../../editor/useDeferredTextCommit";
import { useEditorNavigation } from "../../../editor/EditorNavigationContext";
import {
    listReferenceId,
    type ListReferenceStyle,
} from "../../../project/listReferenceId";
import { fieldLabelImportance } from "../../../template/fieldImportance";
import { m } from "../../../paraglide/messages.js";
import entryStyles from "../../../styles/inputEntry.module.css";
import styles from "./AuthorsField.module.css";

type AuthorEntry = {
    name?: string;
    affiliations?: string[];
    titles?: string[];
};

export interface AuthorsFieldProps {
    label: string;
    importance?: InputSchema["importance"];
    nameLabel: string;
    nameImportance?: InputSchema["importance"];
    namePlaceholder?: string;
    authors: AuthorEntry[];
    affiliations: unknown[];
    titles?: unknown[];
    affiliationsLabel: string;
    titlesLabel: string;
    referenceStyle?: ListReferenceStyle;
}

const AuthorReferenceCheckbox = ({
    authorIndex,
    field,
    referenceValue,
    label,
    checked,
    selectedReferences,
}: {
    authorIndex: number;
    field: "affiliations" | "titles";
    referenceValue: string;
    label: string;
    checked: boolean;
    selectedReferences: string[];
}) => {
    const { dispatch } = useDocumentAst();
    const path = `/authors/${authorIndex}/${field}`;
    const selectedIndex = selectedReferences.indexOf(referenceValue);
    const fieldPath =
        selectedIndex >= 0 ? `${path}/${selectedIndex}` : path;
    const fieldBinding = useEditorFieldBinding<HTMLInputElement>({
        elementId: projectInputElementId,
        fieldId: projectInputFieldId(fieldPath),
    });

    const handleToggle = (nextChecked: boolean) => {
        const nextReferences = nextChecked
            ? [...selectedReferences, referenceValue]
            : selectedReferences.filter((ref) => ref !== referenceValue);

        dispatch({
            type: "UPDATE_INPUT",
            payload: { path, value: nextReferences },
        });
    };

    return (
        <Checkbox
            {...fieldBinding}
            className={styles.inlineCheckbox}
            label={label}
            checked={checked}
            onChange={(event) => handleToggle(event.target.checked)}
        />
    );
};

const AuthorReferenceGroup = ({
    authorIndex,
    field,
    groupLabel,
    items,
    selectedReferences,
    referenceStyle,
    emptyLabel,
    fallbackLabel,
}: {
    authorIndex: number;
    field: "affiliations" | "titles";
    groupLabel: string;
    items: unknown[];
    selectedReferences: string[];
    referenceStyle: ListReferenceStyle;
    emptyLabel: string;
    fallbackLabel: (index: number) => string;
}) => {
    if (!items.some((item) => inputRichTextPlain(item).trim().length > 0)) {
        return (
            <div className={styles.referenceGroup}>
                <span className={styles.referenceGroupLabel}>{groupLabel}</span>
                <p className={styles.emptyAffiliations}>{emptyLabel}</p>
            </div>
        );
    }

    return (
        <div className={styles.referenceGroup}>
            <span className={styles.referenceGroupLabel}>{groupLabel}</span>
            <div className={styles.inlineAffiliations}>
            {items.map((item, index) => {
                const plain = inputRichTextPlain(item).trim();
                if (!plain) {
                    return null;
                }
                const referenceValue = listReferenceId(index, referenceStyle);
                const displayName = plain || fallbackLabel(index + 1);

                return (
                    <AuthorReferenceCheckbox
                        authorIndex={authorIndex}
                        checked={selectedReferences.includes(referenceValue)}
                        field={field}
                        key={`${authorIndex}-${field}-${referenceValue}`}
                        label={displayName}
                        referenceValue={referenceValue}
                        selectedReferences={selectedReferences}
                    />
                );
            })}
            </div>
        </div>
    );
};

const AuthorRow = ({
    author,
    authorIndex,
    affiliations,
    titles,
    affiliationsLabel,
    titlesLabel,
    nameLabel,
    nameImportance,
    namePlaceholder,
    referenceStyle,
    showTitles,
    onInsertBelow,
}: {
    author: AuthorEntry;
    authorIndex: number;
    affiliations: unknown[];
    titles: unknown[];
    affiliationsLabel: string;
    titlesLabel: string;
    nameLabel: string;
    nameImportance?: InputSchema["importance"];
    namePlaceholder?: string;
    referenceStyle: ListReferenceStyle;
    showTitles: boolean;
    onInsertBelow: () => void;
}) => {
    const { dispatch } = useDocumentAst();
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const committedName = author.name ?? "";
    const { draft, setDraft, shouldCommit } = useDeferredTextCommit(committedName);
    const namePath = `/authors/${authorIndex}/name`;
    const fieldId = projectInputFieldId(namePath);
    const nameBinding = useEditorFieldBinding<HTMLInputElement>({
        elementId: projectInputElementId,
        fieldId,
    });

    const updateName = (next: string) => {
        const normalized = normalizeEditableText(next);
        setDraft(normalized);
        if (!shouldCommit(normalized)) {
            return;
        }

        dispatch({
            type: "UPDATE_INPUT",
            payload: { path: namePath, value: normalized },
        });
    };

    const affiliationReferences = Array.isArray(author.affiliations)
        ? author.affiliations.map(String)
        : [];
    const titleReferences = Array.isArray(author.titles)
        ? author.titles.map(String)
        : [];

    return (
        <>
            <TextInput
                {...nameBinding}
                fullWidth
                importance={fieldLabelImportance(nameImportance)}
                label={nameLabel}
                placeholder={namePlaceholder}
                value={draft}
                onChange={(event) => updateName(event.target.value)}
                onKeyDown={(event) => {
                    if (
                        event.key === "Enter" &&
                        !event.ctrlKey &&
                        !event.metaKey &&
                        !event.shiftKey
                    ) {
                        event.preventDefault();
                        const normalized = normalizeEditableText(draft);
                        if (normalized !== committedName) {
                            dispatch({
                                type: "UPDATE_INPUT",
                                payload: { path: namePath, value: normalized },
                            });
                        }
                        onInsertBelow();
                        return;
                    }
                    handleAdvanceKeyDown(event, fieldId);
                }}
            />
            <AuthorReferenceGroup
                authorIndex={authorIndex}
                emptyLabel={m.editor_reference_empty({
                    label: affiliationsLabel,
                })}
                fallbackLabel={(index) =>
                    m.editor_affiliation_fallback({ index })
                }
                field="affiliations"
                groupLabel={affiliationsLabel}
                items={affiliations}
                referenceStyle={referenceStyle}
                selectedReferences={affiliationReferences}
            />
            {showTitles ? (
                <AuthorReferenceGroup
                    authorIndex={authorIndex}
                    emptyLabel={m.editor_reference_empty({
                        label: titlesLabel,
                    })}
                    fallbackLabel={(index) =>
                        m.editor_degree_fallback({ index })
                    }
                    field="titles"
                    groupLabel={titlesLabel}
                    items={titles}
                    referenceStyle={referenceStyle}
                    selectedReferences={titleReferences}
                />
            ) : null}
        </>
    );
};

export const AuthorsField = ({
    label,
    importance,
    nameLabel,
    nameImportance,
    namePlaceholder,
    authors,
    affiliations,
    titles = [],
    affiliationsLabel,
    titlesLabel,
    referenceStyle = "numeric",
}: AuthorsFieldProps) => {
    const { dispatch } = useDocumentAst();
    const { focusField } = useEditorNavigation();
    const showTitles = titles.length > 0 || referenceStyle === "lowercase-alpha";

    const insertAuthorBelow = useCallback(
        (index: number) => {
            const nextIndex = index + 1;
            dispatch({
                type: "INSERT_INPUT_ARRAY_ITEM",
                payload: {
                    path: "/authors",
                    index: nextIndex,
                    value: {
                        name: "",
                        affiliations: [],
                        ...(showTitles ? { titles: [] } : {}),
                    },
                },
            });
            focusField(
                projectInputElementId,
                projectInputFieldId(`/authors/${nextIndex}/name`),
            );
        },
        [dispatch, focusField, showTitles],
    );

    const addAuthor = useCallback(() => {
        dispatch({
            type: "INSERT_INPUT_ARRAY_ITEM",
            payload: {
                path: "/authors",
                index: authors.length,
                value: {
                    name: "",
                    affiliations: [],
                    ...(showTitles ? { titles: [] } : {}),
                },
            },
        });
    }, [authors.length, dispatch, showTitles]);

    const removeAuthor = useCallback(
        (index: number) => {
            dispatch({
                type: "REMOVE_INPUT_ARRAY_ITEM",
                payload: { path: "/authors", index },
            });
        },
        [dispatch],
    );

    return (
        <div className={styles.field}>
            <FieldLabel importance={fieldLabelImportance(importance)}>{label}</FieldLabel>
            {authors.length > 0 && (
                <div className={entryStyles.list}>
                    {authors.map((author, index) => (
                        <div
                            className={`${entryStyles.card} ${entryStyles.cardWithRemove}`}
                            key={`author-${index}`}
                        >
                            <InputEntryRemoveButton
                                ariaLabel={m.editor_remove_author()}
                                onClick={() => removeAuthor(index)}
                            />
                            <AuthorRow
                                author={author}
                                authorIndex={index}
                                affiliations={affiliations}
                                affiliationsLabel={affiliationsLabel}
                                titles={titles}
                                titlesLabel={titlesLabel}
                                nameImportance={nameImportance}
                                nameLabel={nameLabel}
                                namePlaceholder={namePlaceholder}
                                onInsertBelow={() => insertAuthorBelow(index)}
                                referenceStyle={referenceStyle}
                                showTitles={showTitles}
                            />
                        </div>
                    ))}
                </div>
            )}
            <InputEntryAddButton label={label} onClick={addAuthor} />
        </div>
    );
};
