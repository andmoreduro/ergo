import { memo, useMemo, useState } from "react";

import { Delete24Regular } from "@fluentui/react-icons";

import { BibliographyPanelContext } from "../../../actions/contexts/BibliographyPanelContext";
import { TauriApi } from "../../../api/tauri";
import type { BibliographyLookupOutcome } from "../../../bindings/BibliographyLookupOutcome";
import type { LookupCandidate } from "../../../bindings/LookupCandidate";
import type { ReferenceEntry } from "../../../bindings/ReferenceEntry";
import {
    compareBibliographyEntries,
    emptyReferenceFormValue,
    formValueFromLookupBiblatex,
    formValueFromReference,
    formatReferenceCitation,
    mergeLookupIntoForm,
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
import { useDocumentActions } from "../../../state/DocumentContext";
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

type DraftPhase = "lookup" | "manual";

type LookupChoice = {
    candidates: LookupCandidate[];
    session: string;
    url: string;
};

type LookupState = {
    query: string;
    loading: boolean;
    error: string | null;
    /** Pending multi-result choice from an `ambiguous` outcome. */
    choice: LookupChoice | null;
};

type ReferenceDraft = {
    id: string;
    mode: "create" | "edit";
    form: ReferenceFormValue;
    /** `lookup` is the identifier-first step of a new entry; `manual` is the form. */
    phase: DraftPhase;
    lookup: LookupState;
};

const idleLookup = (): LookupState => ({
    query: "",
    loading: false,
    error: null,
    choice: null,
});

type LookupFailure = Exclude<
    BibliographyLookupOutcome,
    { kind: "found" } | { kind: "ambiguous" }
>;

const lookupFailureMessage = (outcome: LookupFailure): string => {
    switch (outcome.kind) {
        case "disabled":
            return m.bibliography_lookup_disabled();
        case "server_unavailable":
            return m.bibliography_lookup_server_unavailable();
        case "not_an_identifier":
            return m.bibliography_lookup_not_an_identifier();
        case "not_found":
            return m.bibliography_lookup_not_found();
        case "failed":
            return m.bibliography_lookup_failed({ message: outcome.message });
    }
};

/** Text of an IPC rejection (`ErgoError` objects carry `message`). */
const errorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === "object" && error !== null && "message" in error) {
        return String((error as { message: unknown }).message);
    }
    return String(error);
};

export const SidebarBibliographyPanel = memo(
    ({
        references,
        zoteroTranslationServerEnabled = false,
    }: {
        references: ReferenceEntry[];
        zoteroTranslationServerEnabled?: boolean;
    }) => {
        const { dispatch } = useDocumentActions();
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
                phase: zoteroTranslationServerEnabled ? "lookup" : "manual",
                lookup: idleLookup(),
            });
        };

        const startEdit = (reference: ReferenceEntry) => {
            setValidationError(null);
            setDraft({
                id: reference.id,
                mode: "edit",
                form: formValueFromReference(reference),
                phase: "manual",
                lookup: idleLookup(),
            });
        };

        const updateLookup = (patch: Partial<LookupState>) => {
            setDraft((current) =>
                current
                    ? { ...current, lookup: { ...current.lookup, ...patch } }
                    : current,
            );
        };

        const openManualForm = () => {
            setDraft((current) =>
                current
                    ? {
                          ...current,
                          phase: "manual",
                          lookup: {
                              ...current.lookup,
                              loading: false,
                              error: null,
                              choice: null,
                          },
                      }
                    : current,
            );
            setValidationError(null);
        };

        const applyLookupOutcome = (outcome: BibliographyLookupOutcome) => {
            if (outcome.kind === "ambiguous") {
                updateLookup({
                    loading: false,
                    error: null,
                    choice: {
                        candidates: outcome.candidates,
                        session: outcome.session,
                        url: outcome.url,
                    },
                });
                return;
            }

            if (outcome.kind !== "found") {
                updateLookup({
                    loading: false,
                    error: lookupFailureMessage(outcome),
                    choice: null,
                });
                return;
            }

            const lookupForm = formValueFromLookupBiblatex(outcome.biblatex);
            if (!lookupForm) {
                updateLookup({
                    loading: false,
                    error: m.bibliography_lookup_unreadable(),
                    choice: null,
                });
                return;
            }

            // The identifier-first step replaces the empty draft; inside the form
            // (create or edit) the result merges over what the user already has
            // and the reference id is kept.
            setDraft((current) =>
                current
                    ? {
                          ...current,
                          form:
                              current.phase === "lookup"
                                  ? lookupForm
                                  : mergeLookupIntoForm(current.form, lookupForm),
                          phase: "manual",
                          lookup: {
                              ...current.lookup,
                              loading: false,
                              error: null,
                              choice: null,
                          },
                      }
                    : current,
            );
            setValidationError(null);
        };

        const runLookupRequest = async (
            request: () => Promise<BibliographyLookupOutcome>,
        ) => {
            updateLookup({ loading: true, error: null, choice: null });
            try {
                applyLookupOutcome(await request());
            } catch (error) {
                updateLookup({
                    loading: false,
                    error: m.bibliography_lookup_failed({
                        message: errorMessage(error),
                    }),
                });
            }
        };

        const runLookup = () => {
            if (!draft || draft.lookup.loading) {
                return;
            }
            const query = draft.lookup.query.trim();
            if (!query) {
                return;
            }
            void runLookupRequest(() => TauriApi.lookupBibliographyMetadata(query));
        };

        const chooseCandidate = (candidate: LookupCandidate) => {
            const choice = draft?.lookup.choice;
            if (!draft || !choice || draft.lookup.loading) {
                return;
            }
            void runLookupRequest(() =>
                TauriApi.selectBibliographyLookupCandidate(
                    choice.url,
                    choice.session,
                    candidate.key,
                    candidate.title,
                ),
            );
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
            draft.phase === "lookup";
        const lookup = draft?.lookup ?? idleLookup();
        const lookupLabel = lookup.loading
            ? m.bibliography_lookup_loading()
            : m.bibliography_lookup();
        const canRunLookup = !lookup.loading && lookup.query.trim().length > 0;

        const lookupQueryInput = draft ? (
            <TextInput
                fullWidth
                aria-label={m.bibliography_lookup()}
                placeholder={m.bibliography_lookup_placeholder()}
                disabled={lookup.loading}
                value={lookup.query}
                onChange={(event) => {
                    updateLookup({ query: event.target.value, error: null });
                }}
                onKeyDown={
                    isLookupPhase
                        ? undefined
                        : (event) => {
                              // Inside the manual form Enter would submit (save);
                              // route it to the lookup instead.
                              if (event.key === "Enter") {
                                  event.preventDefault();
                                  runLookup();
                              }
                          }
                }
            />
        ) : null;

        const lookupFeedback = draft ? (
            <>
                {lookup.error ? (
                    <p className={styles.referenceError} role="alert">
                        {lookup.error}
                    </p>
                ) : null}
                {lookup.choice ? (
                    <>
                        <p className={styles.referenceHint}>
                            {m.bibliography_lookup_choose()}
                        </p>
                        <div className={styles.navList}>
                            {lookup.choice.candidates.map((candidate) => (
                                <NavItemButton
                                    variant="sidebar"
                                    key={candidate.key}
                                    disabled={lookup.loading}
                                    title={candidate.title}
                                    onClick={() => chooseCandidate(candidate)}
                                >
                                    <span>{candidate.title}</span>
                                </NavItemButton>
                            ))}
                        </div>
                    </>
                ) : null}
            </>
        ) : null;

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
                                      label: lookupLabel,
                                      disabled: !canRunLookup,
                                      onClick: runLookup,
                                  }
                                : {
                                      label: m.bibliography_save(),
                                      disabled: lookup.loading,
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
                                {lookupQueryInput}
                                <div className={styles.referenceActions}>
                                    <Button
                                        fullWidth
                                        size="small"
                                        type="button"
                                        variant="secondary"
                                        disabled={lookup.loading}
                                        onClick={openManualForm}
                                    >
                                        {m.bibliography_cite_manually()}
                                    </Button>
                                </div>
                                {lookupFeedback}
                            </>
                        ) : (
                            <>
                                {zoteroTranslationServerEnabled ? (
                                    <>
                                        <div className={styles.referenceLookupRow}>
                                            {lookupQueryInput}
                                            <Button
                                                size="small"
                                                type="button"
                                                variant="secondary"
                                                disabled={!canRunLookup}
                                                onClick={runLookup}
                                            >
                                                {lookupLabel}
                                            </Button>
                                        </div>
                                        {lookupFeedback}
                                    </>
                                ) : null}
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
