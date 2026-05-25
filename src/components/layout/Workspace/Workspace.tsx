import type { Dispatch, SetStateAction } from "react";
import { Sidebar } from "../Sidebar/Sidebar";
import { Editor } from "../Editor/Editor";
import { Preview } from "../Preview/Preview";
import { EditorFieldRegistryProvider } from "../../../state/EditorFieldRegistry";
import { TemplateSpecProvider } from "../../../state/TemplateSpecContext";
import { useDocumentAst, useDocumentSync } from "../../../state/DocumentContext";
import { useCompiler } from "../../../hooks/useCompiler";
import { useContextMenuTrigger } from "../../../contextMenu/ContextMenuProvider";
import styles from "./Workspace.module.css";

export interface WorkspaceProps {
    previewZoom: number;
    onPreviewZoomChange: Dispatch<SetStateAction<number>>;
    previewZoomRenderDebounceMs: number;
}

export const Workspace = ({
    previewZoom,
    onPreviewZoomChange,
    previewZoomRenderDebounceMs,
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
    const contextMenu = useContextMenuTrigger("workspace");

    return (
        <TemplateSpecProvider templateId={state.metadata.template_id}>
            <EditorFieldRegistryProvider>
                <div className={styles.workspace} {...contextMenu}>
                    <Sidebar
                        outline={compiler.outline}
                        resources={compiler.resources}
                        previewRevision={compiler.previewRevision}
                        previewZoomRenderDebounceMs={previewZoomRenderDebounceMs}
                    />
                    <Editor />
                    <Preview
                        compiler={compiler}
                        zoom={previewZoom}
                        onZoomChange={onPreviewZoomChange}
                        zoomRenderDebounceMs={previewZoomRenderDebounceMs}
                    />
                </div>
            </EditorFieldRegistryProvider>
        </TemplateSpecProvider>
    );
};
