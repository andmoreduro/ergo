import { useCallback } from "react";
import type { InputSchema } from "../../../bindings/InputSchema";
import { Checkbox } from "../../atoms/Checkbox/Checkbox";
import { EditorAddButton } from "../../atoms/EditorAddButton/EditorAddButton";
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
import styles from "./AuthorsField.module.css";

type AuthorEntry = {
    name?: string;
    affiliations?: string[];
    degrees?: string[];
};

export interface AuthorsFieldProps {
    label: string;
    importance?: InputSchema["importance"];
    authors: AuthorEntry[];
    affiliations: unknown[];
    degrees?: unknown[];
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
    items,
    selectedReferences,
    referenceStyle,
    emptyLabel,
    fallbackLabel,
}: {
    authorIndex: number;
    field: "affiliations" | "degrees";
    items: unknown[];
    selectedReferences: string[];
    referenceStyle: ListReferenceStyle;
    emptyLabel: string;
    fallbackLabel: (index: number) => string;
}) => {
    if (!items.some((item) => inputRichTextPlain(item).trim().length > 0)) {
        return (
            <p className={styles.emptyAffiliations}>{emptyLabel}</p>
        );
    }

    return (
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
    );
};

const AuthorRow = ({
    author,
    authorIndex,
    affiliations,
    degrees,
    referenceStyle,
    showDegrees,
}: {
    author: AuthorEntry;
    authorIndex: number;
    affiliations: unknown[];
    degrees: unknown[];
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
        <div className={styles.authorBlock}>
            <TextInput
                {...nameBinding}
                className={styles.nameInput}
                placeholder={m.editor_author_name()}
                value={draft}
                onChange={(event) => updateName(event.target.value)}
                onKeyDown={(event) => {
                    handleAdvanceKeyDown(event, fieldId);
                }}
            />
            <AuthorReferenceGroup
                authorIndex={authorIndex}
                emptyLabel={m.editor_reference_empty({
                    label: m.editor_affiliations(),
                })}
                fallbackLabel={(index) =>
                    m.editor_affiliation_fallback({ index })
                }
                field="affiliations"
                items={affiliations}
                referenceStyle={referenceStyle}
                selectedReferences={affiliationReferences}
            />
            {showDegrees ? (
                <AuthorReferenceGroup
                    authorIndex={authorIndex}
                    emptyLabel={m.editor_reference_empty({
                        label: m.editor_degrees(),
                    })}
                    fallbackLabel={(index) =>
                        m.editor_degree_fallback({ index })
                    }
                    field="degrees"
                    items={degrees}
                    referenceStyle={referenceStyle}
                    selectedReferences={degreeReferences}
                />
            ) : null}
        </div>
    );
};

export const AuthorsField = ({
    label,
    importance,
    authors,
    affiliations,
    degrees = [],
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

    return (
        <div className={styles.field}>
            <FieldLabel importance={importance ?? undefined}>{label}</FieldLabel>
            {authors.length > 0 && (
                <div className={styles.authorList}>
                    {authors.map((author, index) => (
                        <AuthorRow
                            author={author}
                            authorIndex={index}
                            affiliations={affiliations}
                            degrees={degrees}
                            key={`author-${index}`}
                            referenceStyle={referenceStyle}
                            showDegrees={showDegrees}
                        />
                    ))}
                </div>
            )}
            <EditorAddButton
                ariaLabel={m.editor_add_author()}
                onClick={addAuthor}
            />
        </div>
    );
};
