import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type Dispatch,
    type SetStateAction,
} from "react";
import { Sidebar } from "../Sidebar/Sidebar";
import { Editor } from "../Editor/Editor";
import { Preview } from "../Preview/Preview";
import { EditorFieldRegistryProvider } from "../../../state/EditorFieldRegistry";
import { TemplateSpecProvider } from "../../../state/TemplateSpecContext";
import { useDocumentAst, useDocumentSync } from "../../../state/DocumentContext";
import { useCompiler } from "../../../hooks/useCompiler";
import { useSidebarOutline } from "../Sidebar/SidebarOutline";
import { useContextMenuTrigger } from "../../organisms/ContextMenu/ContextMenuProvider";
import { ColumnResizeHandle } from "./ColumnResizeHandle";
import { useWorkspaceColumns } from "./useWorkspaceColumns";
import type { PreviewZoomMode } from "../../../preview/previewZoom";
import { Toast } from "../../molecules/Toast/Toast";
import { m } from "../../../paraglide/messages.js";
import styles from "./Workspace.module.css";

export interface WorkspaceProps {
    previewZoom: number;
    previewZoomMode: PreviewZoomMode;
    onPreviewZoomChange: Dispatch<SetStateAction<number>>;
    onPreviewZoomModeChange: Dispatch<SetStateAction<PreviewZoomMode>>;
    onExportDocument: (
        format: import("../../../bindings/ExportFormat").ExportFormat,
    ) => void | Promise<void>;
}

export const Workspace = ({
    previewZoom,
    previewZoomMode,
    onPreviewZoomChange,
    onPreviewZoomModeChange,
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
    const previewScrollRef = useRef<HTMLDivElement>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const toastTimeoutRef = useRef<number | null>(null);
    const { outlineEntries } = useSidebarOutline(
        compiler.outline,
        compiler.previewRevision,
        previewScrollRef,
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

    const showToast = useCallback((message: string) => {
        setToastMessage(message);
        if (toastTimeoutRef.current !== null) {
            window.clearTimeout(toastTimeoutRef.current);
        }
        toastTimeoutRef.current = window.setTimeout(() => {
            setToastMessage(null);
            toastTimeoutRef.current = null;
        }, 4500);
    }, []);

    useEffect(
        () => () => {
            if (toastTimeoutRef.current !== null) {
                window.clearTimeout(toastTimeoutRef.current);
            }
        },
        [],
    );

    useEffect(() => {
        if (!compiler.error) {
            return;
        }

        showToast(
            m.preview_compile_failed_toast({
                message: compiler.error,
            }),
        );
    }, [compiler.error, showToast]);

    useEffect(() => {
        const onToast = (event: Event) => {
            const detail = (event as CustomEvent<{ message?: string }>).detail;
            if (!detail?.message) {
                return;
            }

            showToast(detail.message);
        };

        window.addEventListener("ergo:toast", onToast);
        return () => window.removeEventListener("ergo:toast", onToast);
    }, [showToast]);

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
                            resourcePreviewRevisions={
                                compiler.resourcePreviewRevisions
                            }
                            mainPreviewPaintedRevision={
                                compiler.mainPreviewPaintedRevision
                            }
                            previewScrollRef={previewScrollRef}
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
                            zoomMode={previewZoomMode}
                            onZoomChange={onPreviewZoomChange}
                            onZoomModeChange={onPreviewZoomModeChange}
                            onExport={onExportDocument}
                            scrollRef={previewScrollRef}
                        />
                    </div>
                    {toastMessage ? <Toast message={toastMessage} /> : null}
                </div>
            </EditorFieldRegistryProvider>
        </TemplateSpecProvider>
    );
};
