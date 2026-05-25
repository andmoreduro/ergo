import { useRef, type RefObject } from "react";
import type { DocumentOutline } from "../../../bindings/DocumentOutline";
import type { DocumentResources } from "../../../bindings/DocumentResources";
import { useDocument } from "../../../state/DocumentContext";
import { PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS } from "../../../preview/previewZoom";
import { Accordion } from "../../molecules/Accordion/Accordion";
import { m } from "../../../paraglide/messages.js";
import { SidebarBibliographyPanel } from "./SidebarBibliography";
import { SidebarOutlinePanel } from "./SidebarOutline";
import { SidebarResourcesPanel } from "./SidebarResources";
import styles from "./Sidebar.module.css";

export interface SidebarProps {
    previewZoomRenderDebounceMs?: number;
    outline?: DocumentOutline | null;
    resources?: DocumentResources | null;
    previewRevision?: number | null;
    previewScrollRef?: RefObject<HTMLElement | null>;
}

export const Sidebar = ({
    outline = null,
    resources = null,
    previewRevision = null,
    previewZoomRenderDebounceMs = PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS,
    previewScrollRef: previewScrollRefFromParent,
}: SidebarProps) => {
    const fallbackPreviewScrollRef = useRef<HTMLElement>(null);
    const previewScrollRef =
        previewScrollRefFromParent ?? fallbackPreviewScrollRef;
    const { state } = useDocument();

    return (
        <aside className={styles.sidebar} data-scroll-region>
            <Accordion title={m.sidebar_compiled_outline()} defaultOpen>
                <SidebarOutlinePanel
                    outline={outline}
                    previewRevision={previewRevision}
                    previewScrollRef={previewScrollRef}
                />
            </Accordion>
            <Accordion title={m.sidebar_bibliography()}>
                <SidebarBibliographyPanel references={state.references} />
            </Accordion>
            <Accordion title={m.sidebar_resources()}>
                <SidebarResourcesPanel
                    resources={resources}
                    revision={previewRevision ?? 0}
                    zoomRenderDebounceMs={previewZoomRenderDebounceMs}
                />
            </Accordion>
        </aside>
    );
};
