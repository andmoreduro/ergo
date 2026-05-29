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
import { m } from "../../../paraglide/messages.js";
import styles from "./AuthorsField.module.css";

type AuthorEntry = {
    name?: string;
    affiliations?: string[];
};

export interface AuthorsFieldProps {
    label: string;
    importance?: InputSchema["importance"];
    authors: AuthorEntry[];
    affiliations: unknown[];
}

const AuthorAffiliationCheckbox = ({
    authorIndex,
    affiliationLabel,
    referenceValue,
    checked,
    selectedReferences,
}: {
    authorIndex: number;
    affiliationLabel: string;
    referenceValue: string;
    checked: boolean;
    selectedReferences: string[];
}) => {
    const { dispatch } = useDocumentAst();
    const path = `/authors/${authorIndex}/affiliations`;
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
            label={affiliationLabel}
            checked={checked}
            onChange={(event) => handleToggle(event.target.checked)}
        />
    );
};

const AuthorRow = ({
    author,
    authorIndex,
    affiliations,
}: {
    author: AuthorEntry;
    authorIndex: number;
    affiliations: unknown[];
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

    const selectedReferences = Array.isArray(author.affiliations)
        ? author.affiliations.map(String)
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
            {affiliations.some(
                (item) => inputRichTextPlain(item).trim().length > 0,
            ) ? (
                <div className={styles.inlineAffiliations}>
                    {affiliations.map((item, index) => {
                        const plain = inputRichTextPlain(item).trim();
                        if (!plain) {
                            return null;
                        }
                        const referenceValue = String(index + 1);
                        const displayName = plain
                            ? plain
                            : m.editor_affiliation_fallback({
                                  index: index + 1,
                              });

                        return (
                            <AuthorAffiliationCheckbox
                                affiliationLabel={displayName}
                                authorIndex={authorIndex}
                                checked={selectedReferences.includes(
                                    referenceValue,
                                )}
                                key={`${authorIndex}-${referenceValue}`}
                                referenceValue={referenceValue}
                                selectedReferences={selectedReferences}
                            />
                        );
                    })}
                </div>
            ) : (
                <p className={styles.emptyAffiliations}>
                    {m.editor_reference_empty({
                        label: m.editor_affiliations(),
                    })}
                </p>
            )}
        </div>
    );
};

export const AuthorsField = ({
    label,
    importance,
    authors,
    affiliations,
}: AuthorsFieldProps) => {
    const { dispatch } = useDocumentAst();

    const addAuthor = useCallback(() => {
        dispatch({
            type: "INSERT_INPUT_ARRAY_ITEM",
            payload: {
                path: "/authors",
                index: authors.length,
                value: { name: "", affiliations: [] },
            },
        });
    }, [authors.length, dispatch]);

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
                            key={`author-${index}`}
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
