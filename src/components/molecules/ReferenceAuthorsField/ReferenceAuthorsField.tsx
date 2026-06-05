import { useCallback } from "react";
import type { FieldImportance } from "../../atoms/FieldLabel/FieldLabel";
import { FieldLabel } from "../../atoms/FieldLabel/FieldLabel";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { InputEntryAddButton } from "../InputEntryControls/InputEntryAddButton";
import { InputEntryRemoveButton } from "../InputEntryControls/InputEntryRemoveButton";
import {
    emptyReferenceAuthor,
    type ReferenceAuthor,
} from "../../../bibliography/biblatexAuthors";
import { m } from "../../../paraglide/messages.js";
import entryStyles from "../../../styles/inputEntry.module.css";
import styles from "./ReferenceAuthorsField.module.css";

export interface ReferenceAuthorsFieldProps {
    label: string;
    importance?: FieldImportance;
    authors: ReferenceAuthor[];
    onChange: (authors: ReferenceAuthor[]) => void;
}

const AuthorRow = ({
    author,
    authorIndex,
    onUpdate,
    onRemove,
}: {
    author: ReferenceAuthor;
    authorIndex: number;
    onUpdate: (index: number, next: ReferenceAuthor) => void;
    onRemove: (index: number) => void;
}) => {
    const updateField = (field: keyof ReferenceAuthor, value: string) => {
        onUpdate(authorIndex, { ...author, [field]: value });
    };

    return (
        <div className={`${entryStyles.card} ${entryStyles.cardWithRemove}`}>
            <InputEntryRemoveButton
                ariaLabel={m.references_remove_author()}
                onClick={() => onRemove(authorIndex)}
            />
            <div className={styles.nameRow}>
                <TextInput
                    fullWidth
                    importance="required"
                    label={m.references_author_family()}
                    value={author.family}
                    onChange={(event) => updateField("family", event.target.value)}
                />
                <TextInput
                    fullWidth
                    label={m.references_author_given()}
                    value={author.given}
                    onChange={(event) => updateField("given", event.target.value)}
                />
            </div>
            <div className={styles.nameRow}>
                <TextInput
                    fullWidth
                    label={m.references_author_given_initial()}
                    value={author.givenInitial}
                    onChange={(event) =>
                        updateField("givenInitial", event.target.value)
                    }
                />
                <TextInput
                    fullWidth
                    label={m.references_author_prefix()}
                    value={author.prefix}
                    onChange={(event) => updateField("prefix", event.target.value)}
                />
                <TextInput
                    fullWidth
                    label={m.references_author_suffix()}
                    value={author.suffix}
                    onChange={(event) => updateField("suffix", event.target.value)}
                />
            </div>
        </div>
    );
};

export const ReferenceAuthorsField = ({
    label,
    importance,
    authors,
    onChange,
}: ReferenceAuthorsFieldProps) => {
    const addAuthor = useCallback(() => {
        onChange([...authors, emptyReferenceAuthor()]);
    }, [authors, onChange]);

    const updateAuthor = useCallback(
        (index: number, next: ReferenceAuthor) => {
            onChange(authors.map((author, authorIndex) => (authorIndex === index ? next : author)));
        },
        [authors, onChange],
    );

    const removeAuthor = useCallback(
        (index: number) => {
            onChange(authors.filter((_, authorIndex) => authorIndex !== index));
        },
        [authors, onChange],
    );

    return (
        <div className={styles.field}>
            <FieldLabel importance={importance}>{label}</FieldLabel>
            {authors.length > 0 ? (
                <div className={entryStyles.list}>
                    {authors.map((author, index) => (
                        <AuthorRow
                            author={author}
                            authorIndex={index}
                            key={`reference-author-${index}`}
                            onRemove={removeAuthor}
                            onUpdate={updateAuthor}
                        />
                    ))}
                </div>
            ) : null}
            <InputEntryAddButton label={label} onClick={addAuthor} />
        </div>
    );
};
