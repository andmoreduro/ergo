import { memo, useMemo } from "react";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import type { DocumentResources } from "../../../bindings/DocumentResources";
import type { ResourceEntry } from "../../../bindings/ResourceEntry";
import type { ResourceKind } from "../../../bindings/ResourceKind";
import type { ResourcePreviewRevisions } from "../../../hooks/useCompiler";
import { useDocument } from "../../../state/DocumentContext";
import { ResourcesPanelContext } from "../../../actions/contexts/ResourcesPanelContext";
import { useActionDispatcher } from "../../../actions/runtime";
import { defaultFieldIdForElement } from "../../../editor/fieldIds";
import { NavItemButton } from "../../atoms/NavItemButton/NavItemButton";
import { Accordion } from "../../molecules/Accordion/Accordion";
import { ResourcePreviewPanel } from "../../molecules/ResourcePreview/ResourcePreview";
import { m } from "../../../paraglide/messages.js";
import styles from "./Sidebar.module.css";

const findElementById = (
    elements: DocumentElement[],
    elementId: string,
): DocumentElement | null =>
    elements.find((element) => element.id === elementId) ?? null;

const resourceGroupLabel = (kind: ResourceKind): string => {
    switch (kind) {
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
    previewRasterizationDebounceMs,
}: {
    resources: DocumentResources | null;
    resourcePreviewRevisions: ResourcePreviewRevisions;
    mainPreviewPaintedRevision: number | null;
    previewRasterizationDebounceMs?: number;
}) => {
    const { state, dispatch } = useDocument();
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
        }
    };

    const duplicateFigure = (entry: ResourceEntry) => {
        if (!entry.source_element_id) {
            return;
        }
        const element = findElementById(elements, entry.source_element_id);
        if (!element || element.type !== "Figure") {
            return;
        }
        dispatch({
            type: "DUPLICATE_ELEMENT",
            payload: {
                elementId: element.id,
            },
        });
    };

    const handleResourceClick = (
        entry: ResourceEntry,
        event: React.MouseEvent,
    ) => {
        if (event.ctrlKey || event.metaKey) {
            if (entry.kind === "figure") {
                duplicateFigure(entry);
            }
            return;
        }
        openResource(entry);
    };

    return (
        <ResourcesPanelContext>
        <div className={styles.resourceAccordions}>
            {resources && resources.groups.length > 0 ? (
                resources.groups.map((group) => (
                    <Accordion
                        key={group.kind}
                        title={resourceGroupLabel(group.kind)}
                        defaultOpen
                        contentClassName={styles.resourceAccordionContent}
                    >
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
                                            className={styles.resourceRowNav}
                                            variant="sidebar"
                                            onClick={(event) =>
                                                handleResourceClick(
                                                    entry,
                                                    event as React.MouseEvent,
                                                )
                                            }
                                        >
                                            <ResourcePreviewPanel
                                                preview={entry.preview}
                                                revision={resourceRevision}
                                                canRender={canRender}
                                                resizeDebounceMs={
                                                    previewRasterizationDebounceMs ??
                                                    200
                                                }
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
                    </Accordion>
                ))
            ) : (
                <p className={styles.empty}>{m.sidebar_empty_resources()}</p>
            )}
        </div>
        </ResourcesPanelContext>
    );
});
