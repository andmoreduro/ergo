import { open } from "@tauri-apps/plugin-dialog";
import { memo, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { AssetEntry } from "../../../bindings/AssetEntry";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import type { DocumentOutline } from "../../../bindings/DocumentOutline";
import type { DocumentResources } from "../../../bindings/DocumentResources";
import type { ReferenceEntry } from "../../../bindings/ReferenceEntry";
import type { ResourceEntry } from "../../../bindings/ResourceEntry";
import { useDocument } from "../../../state/DocumentContext";
import { useActionDispatcher } from "../../../actions/runtime";
import { TauriApi } from "../../../api/tauri";
import { useTypstCanvasPage } from "../../../hooks/useTypstCanvasPage";
import { CompilerClient } from "../../../workers/compilerClient";
import {
    emptyReferenceFormValue,
    formValueFromReference,
    formatReferenceCitation,
    referenceFromFormValue,
    type BibliographyEntryType,
    type ReferenceFormValue,
} from "../../../bibliography/biblatex";
import {
    defaultFieldIdForElement,
    projectInputElementId,
    projectInputFieldId,
} from "../../../editor/fieldIds";
import { createId } from "../../../state/ast/defaults";
import { Button } from "../../atoms/Button/Button";
import { Select } from "../../atoms/Select/Select";
import { Textarea } from "../../atoms/Textarea/Textarea";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { Accordion } from "../../molecules/Accordion/Accordion";
import { m } from "../../../paraglide/messages.js";
import styles from "./Sidebar.module.css";

const outlineIndentStyle = (level: number): CSSProperties => ({
    paddingLeft: `${Math.max(0, level - 1) * 12}px`,
});

type OutlineTarget = {
    elementId: string;
    fieldId: string;
};

type TargetedOutlineEntry = {
    key: string;
    level: number;
    text: string;
    page: number;
    target: OutlineTarget;
};

const normalizeOutlineText = (value: string): string =>
    value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

const headingText = (element: DocumentElement): string =>
    element.type === "Heading"
        ? element.content.map((span) => span.text).join("").trim()
        : "";

const isAbstractEntry = (text: string): boolean => {
    const normalized = normalizeOutlineText(text);
    return (
        normalized === "abstract" ||
        normalized === normalizeOutlineText(m.editor_abstract())
    );
};

const CompiledOutline = memo(({
    entries,
    onEntryClick,
}: {
    entries: TargetedOutlineEntry[];
    onEntryClick: (entry: TargetedOutlineEntry) => void;
}) => {

    if (entries.length === 0) {
        return <p className={styles.empty}>{m.sidebar_empty_outline()}</p>;
    }

    return (
        <ol className={styles.outlineList}>
            {entries.map((entry) => (
                <li key={entry.key}>
                    <button
                        className={styles.outlineItem}
                        style={outlineIndentStyle(entry.level)}
                        type="button"
                        onClick={() => onEntryClick(entry)}
                    >
                        <span>{entry.text}</span>
                        <small>{m.sidebar_outline_page({ page: entry.page })}</small>
                    </button>
                </li>
            ))}
        </ol>
    );
});

type ReferenceDraft = {
    id: string;
    mode: "create" | "edit";
    form: ReferenceFormValue;
};

type AssetDraft = {
    id: string;
    mode: "create" | "edit";
    path: string;
    kind: string;
    caption: string;
};

const entryTypeOptions = () => [
    { value: "article", label: m.references_type_article() },
    { value: "book", label: m.references_type_book() },
    { value: "misc", label: m.references_type_misc() },
];

const ResourceDialog = ({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) => (
    <div className={styles.dialogBackdrop}>
        <section
            aria-labelledby="resource-dialog-title"
            aria-modal="true"
            className={styles.resourceDialog}
            role="dialog"
        >
            <header className={styles.dialogHeader}>
                <h2 id="resource-dialog-title">{title}</h2>
            </header>
            <div className={styles.dialogContent}>{children}</div>
        </section>
    </div>
);

const BibliographyPanel = memo(({ references }: { references: ReferenceEntry[] }) => {
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
                <ResourceDialog
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
                        onChange={(event) => updateDraftField("doi", event.target.value)}
                    />
                    <TextInput
                        fullWidth
                        label={m.references_url()}
                        value={draft.form.url}
                        onChange={(event) => updateDraftField("url", event.target.value)}
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
                </ResourceDialog>
            )}
        </div>
    );
});

const assetFromDraft = (draft: AssetDraft): AssetEntry => ({
    id: draft.id,
    path: draft.path.trim(),
    kind: draft.kind.trim() || "asset",
    caption: draft.caption.trim() || null,
});

const draftFromAsset = (asset: AssetEntry): AssetDraft => ({
    id: asset.id,
    mode: "edit",
    path: asset.path,
    kind: asset.kind,
    caption: asset.caption ?? "",
});

const findElementById = (
    elements: DocumentElement[],
    elementId: string,
): DocumentElement | null =>
    elements.find((element) => {
        if ("id" in element && element.id === elementId) {
            return true;
        }
        return false;
    }) ?? null;

const RESOURCE_PREVIEW_PIXEL_PER_PT = 0.75 * (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

const ResourcePreviewCanvas = ({
    pageNumber,
    revision,
}: {
    pageNumber: number;
    revision: number;
}) => {
    const { canvasRef } = useTypstCanvasPage(
        (requestId) =>
            CompilerClient.renderResourcePage(
                pageNumber,
                RESOURCE_PREVIEW_PIXEL_PER_PT,
                requestId,
            ),
        RESOURCE_PREVIEW_PIXEL_PER_PT,
        [pageNumber, revision],
    );

    return (
        <span className={styles.resourcePreview}>
            <canvas
                ref={canvasRef}
                aria-hidden="true"
                style={{ width: "100%", height: "auto", display: "block" }}
            />
        </span>
    );
};

const ResourcesPanel = memo(({
    resources,
    revision,
}: {
    resources: DocumentResources | null;
    revision: number;
}) => {
    const { state, dispatch } = useDocument();
    const dispatchAction = useActionDispatcher();
    const [draft, setDraft] = useState<AssetDraft | null>(null);

    const elements = useMemo(
        () =>
            state.sections.flatMap((section) =>
                section.type === "Content" ? section.elements : [],
            ),
        [state.sections],
    );

    const startImport = async () => {
        void dispatchAction({
            id: "resources::Create",
            payload: { source: "file" },
        });
        const selected = await open({
            multiple: false,
            directory: false,
        });
        if (typeof selected !== "string") {
            return;
        }
        const result = await TauriApi.importResourceFile(selected);
        await CompilerClient.writeFile(result.asset.path, new Uint8Array(result.bytes));
        dispatch({ type: "ADD_ASSET", payload: { asset: result.asset } });
    };

    const openResource = (entry: ResourceEntry) => {
        void dispatchAction({
            id: "resources::Open",
            payload: { resourceId: entry.id },
        });

        if (entry.asset_id) {
            const asset = state.assets.find((item) => item.id === entry.asset_id);
            if (asset) {
                setDraft(draftFromAsset(asset));
            }
            return;
        }

        if (entry.source_element_id) {
            const element = findElementById(elements, entry.source_element_id);
            if (element) {
                void dispatchAction({
                    id: "editor::FocusField",
                    payload: {
                        elementId: entry.source_element_id,
                        fieldId: defaultFieldIdForElement(element),
                        caretUtf16Offset: null,
                        sourceRevision: null,
                    },
                });
            }
        }
    };

    const saveDraft = () => {
        if (!draft) {
            return;
        }

        void dispatchAction({
            id: "resources::Save",
            payload: { resourceId: draft.id },
        });
        dispatch({
            type: "UPDATE_ASSET",
            payload: { asset: assetFromDraft(draft) },
        });
        setDraft(null);
    };

    const removeDraft = () => {
        if (!draft || draft.mode !== "edit") {
            return;
        }

        void dispatchAction({
            id: "resources::Remove",
            payload: { resourceId: draft.id },
        });
        dispatch({
            type: "REMOVE_ASSET",
            payload: { assetId: draft.id },
        });
        setDraft(null);
    };

    const insertReference = (entry: ResourceEntry) => {
        void dispatchAction({
            id: "resources::InsertReference",
            payload: {
                resourceId: entry.id,
                referenceToken: entry.reference_token,
            },
        });
    };

    return (
        <div className={styles.referencePanel}>
            {resources && resources.groups.length > 0 ? (
                resources.groups.map((group) => (
                    <section className={styles.resourceGroup} key={group.kind}>
                        <h3>{group.label}</h3>
                        <div className={styles.navList}>
                            {group.entries.map((entry) => (
                                <div className={styles.resourceRow} key={entry.id}>
                                    <button
                                        className={styles.navItem}
                                        type="button"
                                        onClick={() => openResource(entry)}
                                    >
                                        {entry.preview.status === "ready" &&
                                        entry.preview.page_number ? (
                                            <ResourcePreviewCanvas
                                                pageNumber={entry.preview.page_number}
                                                revision={revision}
                                            />
                                        ) : (
                                            <span className={styles.resourcePreviewError}>
                                                {entry.preview.diagnostic ??
                                                    m.resources_preview_unavailable()}
                                            </span>
                                        )}
                                        <span>{entry.label}</span>
                                        {entry.subtitle && <small>{entry.subtitle}</small>}
                                    </button>
                                    <Button
                                        size="small"
                                        type="button"
                                        variant="ghost"
                                        onClick={() => insertReference(entry)}
                                    >
                                        {m.resources_insert_reference({
                                            label: entry.label,
                                        })}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </section>
                ))
            ) : (
                <p className={styles.empty}>{m.sidebar_empty_resources()}</p>
            )}
            <Button
                fullWidth
                size="small"
                type="button"
                variant="secondary"
                onClick={() => void startImport()}
            >
                {m.resources_import()}
            </Button>
            {draft && (
                <ResourceDialog
                    title={m.resources_edit()}
                >
                    <TextInput
                        fullWidth
                        disabled
                        label={m.resources_path()}
                        value={draft.path}
                    />
                    <TextInput
                        fullWidth
                        label={m.resources_kind()}
                        value={draft.kind}
                        onChange={(event) =>
                            setDraft((current) =>
                                current ? { ...current, kind: event.target.value } : current,
                            )
                        }
                    />
                    <TextInput
                        fullWidth
                        label={m.resources_caption()}
                        value={draft.caption}
                        onChange={(event) =>
                            setDraft((current) =>
                                current
                                    ? { ...current, caption: event.target.value }
                                    : current,
                            )
                        }
                    />
                    <div className={styles.referenceActions}>
                        <Button
                            size="small"
                            type="button"
                            variant="primary"
                            onClick={saveDraft}
                        >
                            {m.resources_save()}
                        </Button>
                        <Button
                            size="small"
                            type="button"
                            variant="danger"
                            onClick={removeDraft}
                        >
                            {m.resources_remove()}
                        </Button>
                        <Button
                            size="small"
                            type="button"
                            variant="ghost"
                            onClick={() => {
                                void dispatchAction({
                                    id: "resources::Edit",
                                    payload: { resourceId: draft.id, cancelled: true },
                                });
                                setDraft(null);
                            }}
                        >
                            {m.resources_cancel()}
                        </Button>
                    </div>
                </ResourceDialog>
            )}
        </div>
    );
});

export interface SidebarProps {
    outline?: DocumentOutline | null;
    resources?: DocumentResources | null;
    previewRevision?: number | null;
}

export const Sidebar = ({
    outline = null,
    resources = null,
    previewRevision = null,
}: SidebarProps) => {
    const { state } = useDocument();
    const dispatchAction = useActionDispatcher();
    const headingTargets = useMemo(
        () => {
            const targets: Array<{
                element: DocumentElement;
                level: number;
                text: string;
            }> = [];

            for (const section of state.sections) {
                if (section.type !== "Content") {
                    continue;
                }

                for (const element of section.elements) {
                    if (element.type !== "Heading") {
                        continue;
                    }

                    targets.push({
                        element,
                        level: element.level,
                        text: normalizeOutlineText(headingText(element)),
                    });
                }
            }

            return targets;
        },
        [state.sections],
    );
    const outlineEntries = useMemo<TargetedOutlineEntry[]>(() => {
        const usedHeadingIds = new Set<string>();
        let usedAbstract = false;

        return (outline?.entries ?? []).flatMap((entry, index) => {
            if (isAbstractEntry(entry.text) && !usedAbstract) {
                usedAbstract = true;
                return [{
                    key: `abstract-${index}`,
                    level: entry.level,
                    text: entry.text,
                    page: entry.page,
                    target: {
                        elementId: projectInputElementId,
                        fieldId: projectInputFieldId("/abstract_text"),
                    },
                }];
            }

            const normalizedText = normalizeOutlineText(entry.text);
            const match = headingTargets.find(
                ({ element, level, text }) =>
                    !usedHeadingIds.has(element.id) &&
                    level === entry.level &&
                    text === normalizedText,
            );

            if (!match) {
                return [];
            }

            usedHeadingIds.add(match.element.id);
            return [{
                key: `${match.element.id}-${entry.page}-${index}`,
                level: entry.level,
                text: entry.text,
                page: entry.page,
                target: {
                    elementId: match.element.id,
                    fieldId: defaultFieldIdForElement(match.element),
                },
            }];
        });
    }, [headingTargets, outline]);

    const handleOutlineClick = (entry: TargetedOutlineEntry) => {
        void dispatchAction({
            id: "editor::FocusField",
            payload: {
                elementId: entry.target.elementId,
                fieldId: entry.target.fieldId,
                caretUtf16Offset: null,
                sourceRevision: previewRevision,
            },
        });
    };

    return (
        <aside className={styles.sidebar}>
            <Accordion title={m.sidebar_compiled_outline()} defaultOpen>
                <CompiledOutline
                    entries={outlineEntries}
                    onEntryClick={handleOutlineClick}
                />
            </Accordion>
            <Accordion title={m.sidebar_bibliography()}>
                <BibliographyPanel references={state.references} />
            </Accordion>
            <Accordion title={m.sidebar_resources()}>
                <ResourcesPanel resources={resources} revision={previewRevision ?? 0} />
            </Accordion>
        </aside>
    );
};
