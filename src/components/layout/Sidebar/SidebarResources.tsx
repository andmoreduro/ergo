import { memo, useMemo, useState } from "react";
import type { AssetEntry } from "../../../bindings/AssetEntry";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import type { DocumentResources } from "../../../bindings/DocumentResources";
import type { ResourceEntry } from "../../../bindings/ResourceEntry";
import type { ResourceKind } from "../../../bindings/ResourceKind";
import type { ResourcePreviewRevisions } from "../../../hooks/useCompiler";
import { useDocument } from "../../../state/DocumentContext";
import { useActionDispatcher } from "../../../actions/runtime";
import { defaultFieldIdForElement } from "../../../editor/fieldIds";
import { Button } from "../../atoms/Button/Button";
import { NavItemButton } from "../../atoms/NavItemButton/NavItemButton";
import { ResourcePreviewPanel } from "../../molecules/ResourcePreview/ResourcePreview";
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

const resourceGroupLabel = (kind: ResourceKind): string => {
    switch (kind) {
        case "file":
            return m.resources_group_file();
        case "figure":
            return m.resources_group_figure();
        case "diagram":
            return m.resources_group_diagram();
        case "table":
            return m.resources_group_table();
        case "equation":
            return m.resources_group_equation();
        case "custom":
            return m.resources_group_custom();
        default:
            return kind;
    }
};

export const SidebarResourcesPanel = memo(({
    resources,
    resourcePreviewRevisions,
    mainPreviewPaintedRevision,
}: {
    resources: DocumentResources | null;
    resourcePreviewRevisions: ResourcePreviewRevisions;
    mainPreviewPaintedRevision: number | null;
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

    return (
        <div className={styles.referencePanel}>
            {resources && resources.groups.length > 0 ? (
                resources.groups.map((group) => (
                    <section className={styles.resourceGroup} key={group.kind}>
                        <h3>{resourceGroupLabel(group.kind)}</h3>
                        <div className={styles.navList}>
                            {group.entries.map((entry) => {
                                const resourceRevision =
                                    resourcePreviewRevisions[entry.id] ?? 0;
                                const canRender =
                                    mainPreviewPaintedRevision === null
                                        ? resourceRevision === 0
                                        : resourceRevision <= mainPreviewPaintedRevision;

                                return (
                                    <div className={styles.resourceRow} key={entry.id}>
                                        <NavItemButton
                                            variant="sidebar"
                                            onClick={() => openResource(entry)}
                                        >
                                            <ResourcePreviewPanel
                                                preview={entry.preview}
                                                revision={resourceRevision}
                                                canRender={canRender}
                                            />
                                            <span>{entry.label}</span>
                                            {entry.subtitle && (
                                                <small>{entry.subtitle}</small>
                                            )}
                                        </NavItemButton>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))
            ) : (
                <p className={styles.empty}>{m.sidebar_empty_resources()}</p>
            )}
            {draft && (
                <SidebarResourceDialog
                    title={m.resources_edit()}
                    cancelAction={{
                        label: m.resources_cancel(),
                        onClick: () => {
                            void dispatchAction({
                                id: "resources::Edit",
                                payload: { resourceId: draft.id, cancelled: true },
                            });
                            setDraft(null);
                        },
                    }}
                    confirmAction={{
                        label: m.resources_save(),
                        onClick: saveDraft,
                    }}
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
                    <Button
                        size="small"
                        type="button"
                        variant="danger"
                        onClick={removeDraft}
                    >
                        {m.resources_remove()}
                    </Button>
                </SidebarResourceDialog>
            )}
        </div>
    );
});
