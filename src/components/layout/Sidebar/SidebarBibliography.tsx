import { memo, useMemo, useState } from "react";

import { Delete24Regular } from "@fluentui/react-icons";

import { BibliographyPanelContext } from "../../../actions/contexts/BibliographyPanelContext";
import { TauriApi } from "../../../api/tauri";
import type { ReferenceEntry } from "../../../bindings/ReferenceEntry";
import {
    compareBibliographyEntries,
    emptyReferenceFormValue,
    formValueFromLookupBiblatex,
    formValueFromReference,
    formatReferenceCitation,
    referenceAuthorFieldImportance,
    referenceFieldLabel,
    referenceFieldsForEntryType,
    referenceFormFieldImportance,
    referenceFromFormValue,
    sortedBibliographyEntryTypeLabels,
    validateReferenceForm,
    type BibliographyValidationCode,
    type ReferenceFieldKey,
    type ReferenceFormValue,
} from "../../../bibliography/biblatex";
import { useDocument } from "../../../state/DocumentContext";
import { createId } from "../../../state/ast/defaults";
import { Button } from "../../atoms/Button/Button";
import { IconButton } from "../../atoms/IconButton/IconButton";
import { Combobox } from "../../atoms/Combobox/Combobox";
import { NavItemButton } from "../../atoms/NavItemButton/NavItemButton";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { ReferenceAuthorsField } from "../../molecules/ReferenceAuthorsField/ReferenceAuthorsField";
import { m } from "../../../paraglide/messages.js";
import { getLocale } from "../../../paraglide/runtime.js";
import { SidebarResourceDialog } from "./SidebarResourceDialog";
import styles from "./Sidebar.module.css";

type CreatePhase = "lookup" | "manual";

type ReferenceDraft = {
    id: string;
    mode: "create" | "edit";
    form: ReferenceFormValue;
    createPhase?: CreatePhase;
    lookupQuery?: string;
    lookupError?: string | null;
    lookupLoading?: boolean;
};

export const SidebarBibliographyPanel = memo(
    ({
        references,
        zoteroTranslationServerEnabled = false,
    }: {
        references: ReferenceEntry[];
        zoteroTranslationServerEnabled?: boolean;
    }) => {
        const { dispatch } = useDocument();
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
                case "institution":
                    return m.bibliography_required_institution();
                case "number":
                    return m.bibliography_required_number();
            }
        };

        const updateDraftForm = (nextForm: ReferenceFormValue) => {
            setDraft((current) =>
                current
                    ? {
                          ...current,
                          form: nextForm,
                      }
                    : current,
            );
        };

        const updateDraftField = (field: ReferenceFieldKey, value: string) => {
            setDraft((current) =>
                current
                    ? {
                          ...current,
                          form: {
                              ...current.form,
                              fields: {
                                  ...current.form.fields,
                                  [field]: value,
                              },
                          },
                      }
                    : current,
            );
        };

        const startCreate = () => {
            setValidationError(null);
            setDraft({
                id: createId(),
                mode: "create",
                form: emptyReferenceFormValue(),
                createPhase: zoteroTranslationServerEnabled ? "lookup" : "manual",
                lookupQuery: "",
                lookupError: null,
                lookupLoading: false,
            });
        };

        const startEdit = (reference: ReferenceEntry) => {
            setValidationError(null);
            setDraft({
                id: reference.id,
                mode: "edit",
                form: formValueFromReference(reference),
                createPhase: "manual",
            });
        };

        const openManualForm = () => {
            setDraft((current) =>
                current?.mode === "create"
                    ? {
                          ...current,
                          createPhase: "manual",
                          lookupError: null,
                          lookupLoading: false,
                      }
                    : current,
            );
            setValidationError(null);
        };

        const runLookup = async () => {
            if (!draft || draft.mode !== "create" || draft.createPhase !== "lookup") {
                return;
            }

            const query = draft.lookupQuery?.trim() ?? "";
            if (!query) {
                return;
            }

            setDraft((current) =>
                current
                    ? {
                          ...current,
                          lookupLoading: true,
                          lookupError: null,
                      }
                    : current,
            );

            try {
                const biblatex = await TauriApi.lookupBibliographyMetadata(query);
                const form = biblatex ? formValueFromLookupBiblatex(biblatex) : null;

                if (!form) {
                    setDraft((current) =>
                        current
                            ? {
                                  ...current,
                                  lookupLoading: false,
                                  lookupError: m.bibliography_lookup_not_found(),
                              }
                            : current,
                    );
                    return;
                }

                setDraft((current) =>
                    current
                        ? {
                              ...current,
                              form,
                              createPhase: "manual",
                              lookupLoading: false,
                              lookupError: null,
                          }
                        : current,
                );
                setValidationError(null);
            } catch {
                setDraft((current) =>
                    current
                        ? {
                              ...current,
                              lookupLoading: false,
                              lookupError: m.bibliography_lookup_not_found(),
                          }
                        : current,
                );
            }
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

            dispatch({
                type: "REMOVE_REFERENCE",
                payload: { referenceId: draft.id },
            });
            setDraft(null);
        };

        const locale = getLocale();
        const sortedReferences = useMemo(
            () =>
                [...references].sort((left, right) =>
                    compareBibliographyEntries(left, right, locale),
                ),
            [references, locale],
        );
        const entryTypeOptions = useMemo(
            () => sortedBibliographyEntryTypeLabels(locale),
            [locale],
        );
        const selectedEntryTypeLabel =
            entryTypeOptions.find((option) => option.value === draft?.form.entryType)
                ?.label ?? "";

        const formFieldSpecs = draft
            ? referenceFieldsForEntryType(draft.form.entryType)
            : [];

        const isLookupPhase =
            zoteroTranslationServerEnabled &&
            draft?.mode === "create" &&
            draft.createPhase === "lookup";
        const lookupQuery = draft?.lookupQuery ?? "";

        return (
            <BibliographyPanelContext>
            <div className={styles.referencePanel}>
                {sortedReferences.length > 0 ? (
                    <div className={styles.navList}>
                        {sortedReferences.map((reference) => (
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
                        cancelAction={{
                            label: m.bibliography_cancel(),
                            onClick: () => {
                                setDraft(null);
                            },
                        }}
                        confirmAction={
                            isLookupPhase
                                ? {
                                      label: m.bibliography_lookup(),
                                      disabled:
                                          draft.lookupLoading ||
                                          lookupQuery.trim().length === 0,
                                      onClick: () => {
                                          void runLookup();
                                      },
                                  }
                                : {
                                      label: m.bibliography_save(),
                                      onClick: saveDraft,
                                  }
                        }
                        headerAction={
                            draft.mode === "edit" ? (
                                <IconButton
                                    type="button"
                                    title={m.bibliography_remove()}
                                    aria-label={m.bibliography_remove()}
                                    onClick={removeDraft}
                                >
                                    <Delete24Regular />
                                </IconButton>
                            ) : undefined
                        }
                    >
                        {isLookupPhase ? (
                            <>
                                <TextInput
                                    fullWidth
                                    aria-label={m.bibliography_lookup()}
                                    placeholder={m.bibliography_lookup_placeholder()}
                                    disabled={draft.lookupLoading}
                                    value={lookupQuery}
                                    onChange={(event) => {
                                        const nextQuery = event.target.value;
                                        setDraft((current) =>
                                            current
                                                ? {
                                                      ...current,
                                                      lookupQuery: nextQuery,
                                                      lookupError: null,
                                                  }
                                                : current,
                                        );
                                    }}
                                />
                                <div className={styles.referenceActions}>
                                    <Button
                                        fullWidth
                                        size="small"
                                        type="button"
                                        variant="secondary"
                                        disabled={draft.lookupLoading}
                                        onClick={openManualForm}
                                    >
                                        {m.bibliography_cite_manually()}
                                    </Button>
                                </div>
                                {draft.lookupError ? (
                                    <p className={styles.referenceError} role="alert">
                                        {draft.lookupError}
                                    </p>
                                ) : null}
                            </>
                        ) : (
                            <>
                                <Combobox
                                    fullWidth
                                    label={m.references_type()}
                                    options={entryTypeOptions.map(
                                        (option) => option.label,
                                    )}
                                    placeholder={m.references_type_search()}
                                    noResultsLabel={m.references_type_no_results()}
                                    value={selectedEntryTypeLabel}
                                    onChange={(label) => {
                                        const match = entryTypeOptions.find(
                                            (option) => option.label === label,
                                        );
                                        if (match) {
                                            updateDraftForm({
                                                ...draft.form,
                                                entryType: match.value,
                                            });
                                        }
                                    }}
                                />
                                <ReferenceAuthorsField
                                    label={m.references_authors()}
                                    importance={referenceAuthorFieldImportance()}
                                    authors={draft.form.authors}
                                    onChange={(authors) =>
                                        updateDraftForm({ ...draft.form, authors })
                                    }
                                />
                                {formFieldSpecs.map((spec) => (
                                    <TextInput
                                        fullWidth
                                        key={`${draft.form.entryType}-${spec.key}`}
                                        label={referenceFieldLabel(spec.key)}
                                        importance={referenceFormFieldImportance(
                                            draft.form.entryType,
                                            spec.key,
                                        )}
                                        value={draft.form.fields[spec.key] ?? ""}
                                        onChange={(event) =>
                                            updateDraftField(
                                                spec.key,
                                                event.target.value,
                                            )
                                        }
                                    />
                                ))}
                                {validationError ? (
                                    <p className={styles.referenceError} role="alert">
                                        {validationError}
                                    </p>
                                ) : null}
                            </>
                        )}
                    </SidebarResourceDialog>
                )}
            </div>
            </BibliographyPanelContext>
        );
    },
);
