import { useRef, type RefObject } from "react";
import type { DocumentOutline } from "../../../bindings/DocumentOutline";
import type { DocumentResources } from "../../../bindings/DocumentResources";
import type { ResourcePreviewRevisions } from "../../../hooks/useCompiler";
import { useDocument } from "../../../state/DocumentContext";
import { Accordion } from "../../molecules/Accordion/Accordion";
import { m } from "../../../paraglide/messages.js";
import { SidebarBibliographyPanel } from "./SidebarBibliography";
import { SidebarOutlinePanel } from "./SidebarOutline";
import { SidebarResourcesPanel } from "./SidebarResources";
import styles from "./Sidebar.module.css";

export interface SidebarProps {
    outline?: DocumentOutline | null;
    resources?: DocumentResources | null;
    previewRevision?: number | null;
    resourcePreviewRevisions?: ResourcePreviewRevisions;
    mainPreviewPaintedRevision?: number | null;
    previewScrollRef?: RefObject<HTMLElement | null>;
}

export const Sidebar = ({
    outline = null,
    resources = null,
    previewRevision = null,
    resourcePreviewRevisions = {},
    mainPreviewPaintedRevision = null,
    previewScrollRef: previewScrollRefFromParent,
}: SidebarProps) => {
    const fallbackPreviewScrollRef = useRef<HTMLElement>(null);
    const previewScrollRef =
        previewScrollRefFromParent ?? fallbackPreviewScrollRef;
    const { state } = useDocument();

    return (
        <aside
            className={styles.sidebar}
            data-editor-focus-lose-exempt=""
            data-scroll-region
        >
            <Accordion title={m.sidebar_compiled_outline()} defaultOpen>
                <SidebarOutlinePanel
                    outline={outline}
                    previewRevision={previewRevision}
                    previewScrollRef={previewScrollRef}
                />
            </Accordion>
            <Accordion title={m.sidebar_bibliography()} defaultOpen>
                <SidebarBibliographyPanel references={state.references} />
            </Accordion>
            <Accordion title={m.sidebar_resources()} defaultOpen>
                <SidebarResourcesPanel
                    resources={resources}
                    resourcePreviewRevisions={resourcePreviewRevisions}
                    mainPreviewPaintedRevision={mainPreviewPaintedRevision}
                />
            </Accordion>
        </aside>
    );
};
