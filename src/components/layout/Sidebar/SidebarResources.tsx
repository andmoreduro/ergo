import { memo, useMemo } from "react";
import type { AssetEntry } from "../../../bindings/AssetEntry";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import type { DocumentResources } from "../../../bindings/DocumentResources";
import type { ResourceEntry } from "../../../bindings/ResourceEntry";
import type { ResourceKind } from "../../../bindings/ResourceKind";
import type { ResourcePreviewRevisions } from "../../../hooks/useCompiler";
import { useDocument, useDocumentActions } from "../../../state/DocumentContext";
import { ResourcesPanelContext } from "../../../actions/contexts/ResourcesPanelContext";
import { useActionDispatcher } from "../../../actions/runtime";
import { defaultFieldIdForElement } from "../../../editor/fieldIds";
import { isInsertableImageAsset } from "../../../editor/assets/imageAsset";
import { isGeneratedDiagramAssetPath } from "../../../editor/diagram/diagramAsset";
import {
    insertFigureWithAsset,
    lastContentElementId,
} from "../../../editor/insertFigureWithAsset";
import { Image24Regular } from "@fluentui/react-icons";
import { IconButton } from "../../atoms/IconButton/IconButton";
import { NavItemButton } from "../../atoms/NavItemButton/NavItemButton";
import { ResourcePreviewPanel } from "../../molecules/ResourcePreview/ResourcePreview";
import { m } from "../../../paraglide/messages.js";
import styles from "./Sidebar.module.css";

const findElementById = (
    elements: DocumentElement[],
    elementId: string,
): DocumentElement | null =>
    elements.find((element) => element.id === elementId) ?? null;

const findElementByAssetId = (
    elements: DocumentElement[],
    assetId: string,
): DocumentElement | null => {
    for (const element of elements) {
        if (
            (element.type === "Figure" || element.type === "Diagram") &&
            element.asset_id === assetId
        ) {
            return element;
        }
    }
    return null;
};

const canInsertFileAsFigure = (
    kind: ResourceKind,
    asset: AssetEntry | undefined,
): boolean =>
    kind === "file" &&
    asset !== undefined &&
    isInsertableImageAsset(asset.kind, asset.path) &&
    !isGeneratedDiagramAssetPath(asset.path);

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
    const { setDocumentFocus } = useDocumentActions();
    const dispatchAction = useActionDispatcher();

    const elements = useMemo(
        () =>
            state.sections.flatMap((section) =>
                section.type === "Content" ? section.elements : [],
            ),
        [state.sections],
    );

    const focusResourceElement = (element: DocumentElement) => {
        void dispatchAction({
            id: "editor::FocusField",
            payload: {
                elementId: element.id,
                fieldId: defaultFieldIdForElement(element),
                caretUtf16Offset: null,
                sourceRevision: null,
                forcePreviewScroll: true,
            },
        });
    };

    const openResource = (entry: ResourceEntry) => {
        if (entry.source_element_id) {
            const element = findElementById(elements, entry.source_element_id);
            if (element) {
                focusResourceElement(element);
            }
            return;
        }

        if (entry.asset_id) {
            const element = findElementByAssetId(elements, entry.asset_id);
            if (element) {
                focusResourceElement(element);
            }
        }
    };

    const insertFileAsFigure = (assetId: string) => {
        insertFigureWithAsset(
            state,
            assetId,
            dispatch,
            setDocumentFocus,
            lastContentElementId(state),
        );
    };

    return (
        <ResourcesPanelContext>
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
                                const asset = entry.asset_id
                                    ? state.assets.find(
                                          (item) => item.id === entry.asset_id,
                                      )
                                    : undefined;
                                const showInsertFigure = canInsertFileAsFigure(
                                    group.kind,
                                    asset,
                                );

                                return (
                                    <div className={styles.resourceRow} key={entry.id}>
                                        <NavItemButton
                                            className={styles.resourceRowNav}
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
                                        {showInsertFigure && entry.asset_id && (
                                            <IconButton
                                                title={m.resources_insert_figure()}
                                                aria-label={m.resources_insert_figure()}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    insertFileAsFigure(entry.asset_id!);
                                                }}
                                            >
                                                <Image24Regular />
                                            </IconButton>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))
            ) : (
                <p className={styles.empty}>{m.sidebar_empty_resources()}</p>
            )}
        </div>
        </ResourcesPanelContext>
    );
});
