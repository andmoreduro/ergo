import { memo, useState } from "react";
import type { ReferenceEntry } from "../../../bindings/ReferenceEntry";
import {
    bibliographyEntryTypeOptions,
    bibliographyFieldImportance,
    bibliographySecondaryField,
    bibliographySecondaryFieldLabel,
    emptyReferenceFormValue,
    formValueFromReference,
    formatReferenceCitation,
    referenceFromFormValue,
    validateReferenceForm,
    type BibliographyEntryType,
    type BibliographyValidationCode,
    type ReferenceFormValue,
} from "../../../bibliography/biblatex";
import { useDocument } from "../../../state/DocumentContext";
import { useActionDispatcher } from "../../../actions/runtime";
import { createId } from "../../../state/ast/defaults";
import { Button } from "../../atoms/Button/Button";
import { NavItemButton } from "../../atoms/NavItemButton/NavItemButton";
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

export const SidebarBibliographyPanel = memo(
    ({ references }: { references: ReferenceEntry[] }) => {
        const { dispatch } = useDocument();
        const dispatchAction = useActionDispatcher();
        const [draft, setDraft] = useState<ReferenceDraft | null>(null);
        const [validationError, setValidationError] = useState<string | null>(
            null,
        );

        const validationMessage = (code: BibliographyValidationCode): string => {
            switch (code) {
                case "title":
                    return m.bibliography_required_title();
                case "authors":
                    return m.bibliography_required_authors();
                case "year":
                    return m.bibliography_required_year();
                case "journal":
                    return m.bibliography_required_journal();
                case "booktitle":
                    return m.bibliography_required_booktitle();
                case "publisher":
                    return m.bibliography_required_publisher();
            }
        };

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
            setValidationError(null);
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
            setValidationError(null);
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

            const validationCode = validateReferenceForm(draft.form);
            if (validationCode) {
                setValidationError(validationMessage(validationCode));
                return;
            }

            setValidationError(null);
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

        const secondaryField = draft
            ? bibliographySecondaryField(draft.form.entryType)
            : "none";
        const secondaryLabel = draft
            ? bibliographySecondaryFieldLabel(draft.form.entryType)
            : null;

        return (
            <div className={styles.referencePanel}>
                {references.length > 0 ? (
                    <div className={styles.navList}>
                        {references.map((reference) => (
                            <NavItemButton
                                variant="sidebar"
                                key={reference.id}
                                onClick={() => startEdit(reference)}
                            >
                                <span>{formatReferenceCitation(reference)}</span>
                            </NavItemButton>
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
                            importance={bibliographyFieldImportance(draft.form, "entryType")}
                            options={bibliographyEntryTypeOptions()}
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
                            label={m.references_title()}
                            importance={bibliographyFieldImportance(draft.form, "title")}
                            value={draft.form.title}
                            onChange={(event) =>
                                updateDraftField("title", event.target.value)
                            }
                        />
                        <Textarea
                            fullWidth
                            label={m.references_authors()}
                            importance={bibliographyFieldImportance(draft.form, "authors")}
                            value={draft.form.authors}
                            onChange={(event) =>
                                updateDraftField("authors", event.target.value)
                            }
                        />
                        <TextInput
                            fullWidth
                            label={m.references_year()}
                            importance={bibliographyFieldImportance(draft.form, "year")}
                            value={draft.form.year}
                            onChange={(event) =>
                                updateDraftField("year", event.target.value)
                            }
                        />
                        {secondaryField === "containerTitle" && secondaryLabel && (
                            <TextInput
                                fullWidth
                                label={secondaryLabel}
                                importance={bibliographyFieldImportance(
                                    draft.form,
                                    "containerTitle",
                                )}
                                value={draft.form.containerTitle}
                                onChange={(event) =>
                                    updateDraftField("containerTitle", event.target.value)
                                }
                            />
                        )}
                        {secondaryField === "publisher" && (
                            <TextInput
                                fullWidth
                                label={secondaryLabel ?? m.references_publisher()}
                                importance={bibliographyFieldImportance(
                                    draft.form,
                                    "publisher",
                                )}
                                value={draft.form.publisher}
                                onChange={(event) =>
                                    updateDraftField("publisher", event.target.value)
                                }
                            />
                        )}
                        <TextInput
                            fullWidth
                            label={m.references_doi()}
                            importance={bibliographyFieldImportance(draft.form, "doi")}
                            value={draft.form.doi}
                            onChange={(event) =>
                                updateDraftField("doi", event.target.value)
                            }
                        />
                        <TextInput
                            fullWidth
                            label={m.references_url()}
                            importance={bibliographyFieldImportance(draft.form, "url")}
                            value={draft.form.url}
                            onChange={(event) =>
                                updateDraftField("url", event.target.value)
                            }
                        />
                        {validationError && (
                            <p className={styles.referenceError} role="alert">
                                {validationError}
                            </p>
                        )}
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
