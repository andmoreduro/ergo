import { memo, useState } from "react";
import type { ReferenceEntry } from "../../../bindings/ReferenceEntry";
import {
    emptyReferenceFormValue,
    formValueFromReference,
    formatReferenceCitation,
    referenceFromFormValue,
    type BibliographyEntryType,
    type ReferenceFormValue,
} from "../../../bibliography/biblatex";
import { useDocument } from "../../../state/DocumentContext";
import { useActionDispatcher } from "../../../actions/runtime";
import { createId } from "../../../state/ast/defaults";
import { Button } from "../../atoms/Button/Button";
import { Select } from "../../atoms/Select/Select";
import { Textarea } from "../../atoms/Textarea/Textarea";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { m } from "../../../paraglide/messages.js";
import { SidebarResourceDialog } from "./SidebarResourceDialog";
import styles from "./Sidebar.module.css";

type ReferenceDraft = {
    id: string;
    mode: "create" | "edit";
    form: ReferenceFormValue;
};

const entryTypeOptions = () => [
    { value: "article", label: m.references_type_article() },
    { value: "book", label: m.references_type_book() },
    { value: "misc", label: m.references_type_misc() },
];

export const SidebarBibliographyPanel = memo(
    ({ references }: { references: ReferenceEntry[] }) => {
        const { dispatch } = useDocument();
        const dispatchAction = useActionDispatcher();
        const [draft, setDraft] = useState<ReferenceDraft | null>(null);

        const updateDraftField = <K extends keyof ReferenceFormValue>(
            field: K,
            value: ReferenceFormValue[K],
        ) => {
            setDraft((current) =>
                current
                    ? {
                          ...current,
                          form: {
                              ...current.form,
                              [field]: value,
                          },
                      }
                    : current,
            );
        };

        const startCreate = () => {
            void dispatchAction({ id: "bibliography::CreateEntry", payload: null });
            setDraft({
                id: createId(),
                mode: "create",
                form: emptyReferenceFormValue(),
            });
        };

        const startEdit = (reference: ReferenceEntry) => {
            void dispatchAction({
                id: "bibliography::OpenEntry",
                payload: { referenceId: reference.id },
            });
            setDraft({
                id: reference.id,
                mode: "edit",
                form: formValueFromReference(reference),
            });
        };

        const saveDraft = () => {
            if (!draft) {
                return;
            }

            const reference = referenceFromFormValue(draft.id, draft.form);
            void dispatchAction({
                id: "bibliography::SaveEntry",
                payload: { mode: draft.mode, referenceId: draft.id },
            });
            dispatch({
                type: draft.mode === "create" ? "ADD_REFERENCE" : "UPDATE_REFERENCE",
                payload: { reference },
            });
            setDraft(null);
        };

        const removeDraft = () => {
            if (!draft || draft.mode !== "edit") {
                return;
            }

            void dispatchAction({
                id: "bibliography::RemoveEntry",
                payload: { referenceId: draft.id },
            });
            dispatch({
                type: "REMOVE_REFERENCE",
                payload: { referenceId: draft.id },
            });
            setDraft(null);
        };

        return (
            <div className={styles.referencePanel}>
                {references.length > 0 ? (
                    <div className={styles.navList}>
                        {references.map((reference) => (
                            <button
                                className={styles.navItem}
                                type="button"
                                key={reference.id}
                                onClick={() => startEdit(reference)}
                            >
                                <span>{formatReferenceCitation(reference)}</span>
                                <small>{reference.citation_key}</small>
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className={styles.empty}>{m.sidebar_empty_bibliography()}</p>
                )}
                <Button
                    fullWidth
                    size="small"
                    type="button"
                    variant="secondary"
                    onClick={startCreate}
                >
                    {m.bibliography_add()}
                </Button>
                {draft && (
                    <SidebarResourceDialog
                        title={
                            draft.mode === "create"
                                ? m.bibliography_add()
                                : m.bibliography_edit()
                        }
                    >
                        <Select
                            fullWidth
                            label={m.references_type()}
                            options={entryTypeOptions()}
                            value={draft.form.entryType}
                            onChange={(event) =>
                                updateDraftField(
                                    "entryType",
                                    event.target.value as BibliographyEntryType,
                                )
                            }
                        />
                        <TextInput
                            fullWidth
                            label={m.references_citation_key()}
                            value={draft.form.citationKey}
                            onChange={(event) =>
                                updateDraftField("citationKey", event.target.value)
                            }
                        />
                        <TextInput
                            fullWidth
                            label={m.references_title()}
                            value={draft.form.title}
                            onChange={(event) =>
                                updateDraftField("title", event.target.value)
                            }
                        />
                        <Textarea
                            fullWidth
                            label={m.references_authors()}
                            value={draft.form.authors}
                            onChange={(event) =>
                                updateDraftField("authors", event.target.value)
                            }
                        />
                        <TextInput
                            fullWidth
                            label={m.references_year()}
                            value={draft.form.year}
                            onChange={(event) =>
                                updateDraftField("year", event.target.value)
                            }
                        />
                        {draft.form.entryType === "article" ? (
                            <TextInput
                                fullWidth
                                label={m.references_journal()}
                                value={draft.form.containerTitle}
                                onChange={(event) =>
                                    updateDraftField("containerTitle", event.target.value)
                                }
                            />
                        ) : (
                            <TextInput
                                fullWidth
                                label={m.references_publisher()}
                                value={draft.form.publisher}
                                onChange={(event) =>
                                    updateDraftField("publisher", event.target.value)
                                }
                            />
                        )}
                        <TextInput
                            fullWidth
                            label={m.references_doi()}
                            value={draft.form.doi}
                            onChange={(event) =>
                                updateDraftField("doi", event.target.value)
                            }
                        />
                        <TextInput
                            fullWidth
                            label={m.references_url()}
                            value={draft.form.url}
                            onChange={(event) =>
                                updateDraftField("url", event.target.value)
                            }
                        />
                        <div className={styles.referenceActions}>
                            <Button
                                size="small"
                                type="button"
                                variant="primary"
                                onClick={saveDraft}
                            >
                                {m.bibliography_save()}
                            </Button>
                            {draft.mode === "edit" && (
                                <Button
                                    size="small"
                                    type="button"
                                    variant="danger"
                                    onClick={removeDraft}
                                >
                                    {m.bibliography_remove()}
                                </Button>
                            )}
                            <Button
                                size="small"
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                    void dispatchAction({
                                        id: "bibliography::CancelEdit",
                                        payload: null,
                                    });
                                    setDraft(null);
                                }}
                            >
                                {m.bibliography_cancel()}
                            </Button>
                        </div>
                    </SidebarResourceDialog>
                )}
            </div>
        );
    },
);
