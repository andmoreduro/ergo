import { useCallback } from "react";
import type { InputSchema } from "../../../bindings/InputSchema";
import { Checkbox } from "../../atoms/Checkbox/Checkbox";
import { InputEntryAddButton } from "../InputEntryControls/InputEntryAddButton";
import { InputEntryRemoveButton } from "../InputEntryControls/InputEntryRemoveButton";
import { FieldLabel } from "../../atoms/FieldLabel/FieldLabel";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { useEditorFieldBinding } from "../../../state/EditorFieldRegistry";
import {
    projectInputElementId,
    projectInputFieldId,
} from "../../../editor/fieldIds";
import { normalizeEditableText } from "../../../editor/textInput";
import { inputRichTextPlain } from "../../../editor/richTextMarks";
import { useDeferredTextCommit } from "../../../editor/useDeferredTextCommit";
import { useEditorNavigation } from "../../../editor/EditorNavigationContext";
import { useDocumentAst } from "../../../state/DocumentContext";
import {
    listReferenceId,
    type ListReferenceStyle,
} from "../../../project/listReferenceId";
import { m } from "../../../paraglide/messages.js";
import entryStyles from "../../../styles/inputEntry.module.css";
import styles from "./AuthorsField.module.css";

type AuthorEntry = {
    name?: string;
    affiliations?: string[];
    degrees?: string[];
};

export interface AuthorsFieldProps {
    label: string;
    importance?: InputSchema["importance"];
    nameLabel: string;
    nameImportance?: InputSchema["importance"];
    namePlaceholder?: string;
    authors: AuthorEntry[];
    affiliations: unknown[];
    degrees?: unknown[];
    affiliationsLabel: string;
    degreesLabel: string;
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
    field: "affiliations" | "degrees";
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
    field: "affiliations" | "degrees";
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
    degrees,
    affiliationsLabel,
    degreesLabel,
    nameLabel,
    nameImportance,
    namePlaceholder,
    referenceStyle,
    showDegrees,
}: {
    author: AuthorEntry;
    authorIndex: number;
    affiliations: unknown[];
    degrees: unknown[];
    affiliationsLabel: string;
    degreesLabel: string;
    nameLabel: string;
    nameImportance?: InputSchema["importance"];
    namePlaceholder?: string;
    referenceStyle: ListReferenceStyle;
    showDegrees: boolean;
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
    const degreeReferences = Array.isArray(author.degrees)
        ? author.degrees.map(String)
        : [];

    return (
        <>
            <TextInput
                {...nameBinding}
                fullWidth
                importance={nameImportance}
                label={nameLabel}
                placeholder={namePlaceholder}
                value={draft}
                onChange={(event) => updateName(event.target.value)}
                onKeyDown={(event) => {
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
            {showDegrees ? (
                <AuthorReferenceGroup
                    authorIndex={authorIndex}
                    emptyLabel={m.editor_reference_empty({
                        label: degreesLabel,
                    })}
                    fallbackLabel={(index) =>
                        m.editor_degree_fallback({ index })
                    }
                    field="degrees"
                    groupLabel={degreesLabel}
                    items={degrees}
                    referenceStyle={referenceStyle}
                    selectedReferences={degreeReferences}
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
    degrees = [],
    affiliationsLabel,
    degreesLabel,
    referenceStyle = "numeric",
}: AuthorsFieldProps) => {
    const { dispatch } = useDocumentAst();
    const showDegrees = degrees.length > 0 || referenceStyle === "lowercase-alpha";

    const addAuthor = useCallback(() => {
        dispatch({
            type: "INSERT_INPUT_ARRAY_ITEM",
            payload: {
                path: "/authors",
                index: authors.length,
                value: {
                    name: "",
                    affiliations: [],
                    ...(showDegrees ? { degrees: [] } : {}),
                },
            },
        });
    }, [authors.length, dispatch, showDegrees]);

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
            <FieldLabel importance={importance ?? undefined}>{label}</FieldLabel>
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
                                degrees={degrees}
                                degreesLabel={degreesLabel}
                                nameImportance={nameImportance}
                                nameLabel={nameLabel}
                                namePlaceholder={namePlaceholder}
                                referenceStyle={referenceStyle}
                                showDegrees={showDegrees}
                            />
                        </div>
                    ))}
                </div>
            )}
            <InputEntryAddButton label={label} onClick={addAuthor} />
        </div>
    );
};
