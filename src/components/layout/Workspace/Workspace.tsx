import { useEffect, type Dispatch, type SetStateAction } from "react";
import { Sidebar } from "../Sidebar/Sidebar";
import { Editor } from "../Editor/Editor";
import { Preview } from "../Preview/Preview";
import { EditorFieldRegistryProvider } from "../../../state/EditorFieldRegistry";
import { TemplateSpecProvider } from "../../../state/TemplateSpecContext";
import { useDocumentAst, useDocumentSync } from "../../../state/DocumentContext";
import { useCompiler } from "../../../hooks/useCompiler";
import { useSidebarOutline } from "../Sidebar/SidebarOutline";
import { useContextMenuTrigger } from "../../../contextMenu/ContextMenuProvider";
import { ColumnResizeHandle } from "./ColumnResizeHandle";
import { useWorkspaceColumns } from "./useWorkspaceColumns";
import styles from "./Workspace.module.css";

export interface WorkspaceProps {
    previewZoom: number;
    onPreviewZoomChange: Dispatch<SetStateAction<number>>;
    previewZoomRenderDebounceMs: number;
    onExportDocument: (
        format: import("../../../bindings/ExportFormat").ExportFormat,
    ) => void | Promise<void>;
}

export const Workspace = ({
    previewZoom,
    onPreviewZoomChange,
    previewZoomRenderDebounceMs,
    onExportDocument,
}: WorkspaceProps) => {
    const { state } = useDocumentAst();
    const { events, sessionId, ackDocumentEvents, eventsVersion, bootstrapFiles } =
        useDocumentSync();
    const compiler = useCompiler(
        state,
        events,
        sessionId,
        ackDocumentEvents,
        eventsVersion,
        bootstrapFiles,
    );
    const { outlineEntries } = useSidebarOutline(
        compiler.outline,
        compiler.previewRevision,
    );
    const contextMenu = useContextMenuTrigger("workspace");
    const {
        rootRef: workspaceRef,
        sidebarStyle,
        editorStyle,
        previewStyle,
        handle1,
        handle2,
    } = useWorkspaceColumns();

    useEffect(() => {
        const root = workspaceRef.current;
        if (!root) {
            return;
        }

        const hideTimers = new WeakMap<EventTarget, ReturnType<typeof setTimeout>>();

        const onScroll = (event: Event) => {
            const target = event.target;
            if (
                !(target instanceof HTMLElement) ||
                !root.contains(target) ||
                !target.hasAttribute("data-scroll-region")
            ) {
                return;
            }

            target.classList.add(styles.scrollbarReveal);

            const previous = hideTimers.get(target);
            if (previous) {
                clearTimeout(previous);
            }

            hideTimers.set(
                target,
                setTimeout(() => {
                    target.classList.remove(styles.scrollbarReveal);
                    hideTimers.delete(target);
                }, 700),
            );
        };

        root.addEventListener("scroll", onScroll, { capture: true, passive: true });
        return () => root.removeEventListener("scroll", onScroll, { capture: true });
    }, []);

    return (
        <TemplateSpecProvider
            templateId={state.metadata.template_id}
            variantId={state.metadata.template_variant_id ?? "student"}
        >
            <EditorFieldRegistryProvider>
                <div ref={workspaceRef} className={styles.workspace} {...contextMenu}>
                    <div className={styles.column} style={sidebarStyle}>
                        <Sidebar
                            outline={compiler.outline}
                            resources={compiler.resources}
                            previewRevision={compiler.previewRevision}
                            previewZoomRenderDebounceMs={
                                previewZoomRenderDebounceMs
                            }
                        />
                    </div>
                    <ColumnResizeHandle {...handle1} />
                    <div className={styles.column} style={editorStyle}>
                        <Editor
                            resources={compiler.resources}
                            outlineEntries={outlineEntries}
                        />
                    </div>
                    <ColumnResizeHandle {...handle2} />
                    <div className={styles.column} style={previewStyle}>
                        <Preview
                            compiler={compiler}
                            zoom={previewZoom}
                            onZoomChange={onPreviewZoomChange}
                            zoomRenderDebounceMs={previewZoomRenderDebounceMs}
                            onExport={onExportDocument}
                        />
                    </div>
                </div>
            </EditorFieldRegistryProvider>
        </TemplateSpecProvider>
    );
};
