import { memo, useRef, type RefObject } from "react";
import type { DocumentOutline } from "../../../bindings/DocumentOutline";
import type { DocumentResources } from "../../../bindings/DocumentResources";
import type { ResourcePreviewRevisions } from "../../../hooks/useCompiler";
import {
    Book24Regular,
    Shapes24Regular,
    TextBulletListTree24Regular,
} from "@fluentui/react-icons";
import { useDocumentAstSelector } from "../../../state/DocumentContext";
import { Tabs } from "../../molecules/Tabs/Tabs";
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
    zoteroTranslationServerEnabled?: boolean;
    previewRasterizationDebounceMs?: number;
}

const SidebarComponent = ({
    outline = null,
    resources = null,
    previewRevision = null,
    resourcePreviewRevisions = {},
    mainPreviewPaintedRevision = null,
    previewScrollRef: previewScrollRefFromParent,
    zoteroTranslationServerEnabled = false,
    previewRasterizationDebounceMs,
}: SidebarProps) => {
    const fallbackPreviewScrollRef = useRef<HTMLElement>(null);
    const previewScrollRef =
        previewScrollRefFromParent ?? fallbackPreviewScrollRef;
    // Only the bibliography needs the AST, and only its references slice — which
    // is preserved by reference across body edits — so the sidebar no longer
    // re-renders on every keystroke.
    const references = useDocumentAstSelector((ast) => ast.references);

    return (
        <aside className={styles.sidebar} data-editor-focus-lose-exempt="">
            <Tabs
                ariaLabel={m.sidebar_sections()}
                tabs={[
                    {
                        id: "outline",
                        label: m.sidebar_compiled_outline(),
                        icon: <TextBulletListTree24Regular />,
                        panel: (
                            <div className={styles.tabSection}>
                                <SidebarOutlinePanel
                                    outline={outline}
                                    previewRevision={previewRevision}
                                    previewScrollRef={previewScrollRef}
                                />
                            </div>
                        ),
                    },
                    {
                        id: "bibliography",
                        label: m.sidebar_bibliography(),
                        icon: <Book24Regular />,
                        panel: (
                            <div className={styles.tabSection}>
                                <SidebarBibliographyPanel
                                    references={references}
                                    zoteroTranslationServerEnabled={
                                        zoteroTranslationServerEnabled
                                    }
                                />
                            </div>
                        ),
                    },
                    {
                        id: "resources",
                        label: m.sidebar_resources(),
                        icon: <Shapes24Regular />,
                        panel: (
                            <SidebarResourcesPanel
                                resources={resources}
                                resourcePreviewRevisions={resourcePreviewRevisions}
                                mainPreviewPaintedRevision={
                                    mainPreviewPaintedRevision
                                }
                                previewRasterizationDebounceMs={
                                    previewRasterizationDebounceMs
                                }
                            />
                        ),
                    },
                ]}
            />
        </aside>
    );
};

/**
 * Memoized so a workspace re-render (every keystroke) doesn't re-render the
 * sidebar; its props come from the memoized compiler result + a stable ref, so
 * it only re-renders when a compile completes or the references slice changes.
 */
export const Sidebar = memo(SidebarComponent);
