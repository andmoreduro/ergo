import { open } from "@tauri-apps/plugin-dialog";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { AssetEntry } from "../../../bindings/AssetEntry";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import type { DocumentResources } from "../../../bindings/DocumentResources";
import type { ResourceEntry } from "../../../bindings/ResourceEntry";
import { useDocument } from "../../../state/DocumentContext";
import { useActionDispatcher } from "../../../actions/runtime";
import { TauriApi } from "../../../api/tauri";
import { useTypstCanvasPage } from "../../../hooks/useTypstCanvasPage";
import { CompilerClient } from "../../../workers/compilerClient";
import { defaultFieldIdForElement } from "../../../editor/fieldIds";
import { Button } from "../../atoms/Button/Button";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { m } from "../../../paraglide/messages.js";
import { SidebarResourceDialog } from "./SidebarResourceDialog";
import styles from "./Sidebar.module.css";

type AssetDraft = {
    id: string;
    mode: "create" | "edit";
    path: string;
    kind: string;
    caption: string;
};

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

const ResourcePreviewCanvas = ({
    pageNumber,
    revision,
    zoomRenderDebounceMs,
}: {
    pageNumber: number;
    revision: number;
    zoomRenderDebounceMs: number;
}) => {
    const containerRef = useRef<HTMLSpanElement>(null);
    const [fitWidthPx, setFitWidthPx] = useState(0);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const updateFitWidth = () => {
            setFitWidthPx(container.clientWidth);
        };

        updateFitWidth();

        if (typeof ResizeObserver === "undefined") {
            return;
        }

        const observer = new ResizeObserver(updateFitWidth);
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    const { canvasRef } = useTypstCanvasPage(
        (requestId, pixelPerPt) =>
            CompilerClient.renderResourcePage(
                pageNumber,
                pixelPerPt,
                requestId,
            ),
        1,
        zoomRenderDebounceMs,
        true,
        pageNumber,
        revision,
        { fitWidthPx },
    );

    return (
        <span ref={containerRef} className={styles.resourcePreview}>
            <canvas ref={canvasRef} aria-hidden="true" style={{ display: "block" }} />
        </span>
    );
};

export const SidebarResourcesPanel = memo(({
    resources,
    revision,
    zoomRenderDebounceMs,
}: {
    resources: DocumentResources | null;
    revision: number;
    zoomRenderDebounceMs: number;
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
                referenceId: entry.id,
                label: entry.label,
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
                                                zoomRenderDebounceMs={
                                                    zoomRenderDebounceMs
                                                }
                                            />
                                        ) : (
                                            <span className={styles.resourcePreviewError}>
                                                {entry.preview.diagnostic ??
                                                    m.resources_preview_unavailable()}
                                            </span>
                                        )}
                                        <span>{entry.label}</span>
                                        {entry.subtitle && (
                                            <small>{entry.subtitle}</small>
                                        )}
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
                <SidebarResourceDialog title={m.resources_edit()}>
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
                </SidebarResourceDialog>
            )}
        </div>
    );
});
