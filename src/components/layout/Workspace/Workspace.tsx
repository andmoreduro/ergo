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
import type { FindBarHandle } from "../../organisms/FindBar/FindBar";
import { Preview, type PreviewHandle } from "../Preview/Preview";
import { EditorFieldRegistryProvider } from "../../../state/EditorFieldRegistry";
import { TemplateSpecProvider } from "../../../state/TemplateSpecContext";
import { useDocumentAst, useDocumentSync } from "../../../state/DocumentContext";
import { useCompiler } from "../../../hooks/useCompiler";
import { useOutlineEntries } from "../Sidebar/SidebarOutline";
import { useContextMenuTrigger } from "../../organisms/ContextMenu/ContextMenuProvider";
import { ColumnResizeHandle } from "./ColumnResizeHandle";
import { useWorkspaceColumns } from "./useWorkspaceColumns";
import type { PreviewZoomMode } from "../../../preview/previewZoom";
import { Toast } from "../../molecules/Toast/Toast";
import { m } from "../../../paraglide/messages.js";
import { notifyUnavailableProjectFonts } from "../../../settings/project/fontAvailability";
import {
    useGlobalSettings,
    usePreviewSettings,
} from "../../../settings/SettingsProvider";
import { registerToastHandler } from "../../../editor/notifyBridge";
import styles from "./Workspace.module.css";

export interface WorkspaceProps {
    previewZoom: number;
    previewZoomMode: PreviewZoomMode;
    onPreviewZoomChange: Dispatch<SetStateAction<number>>;
    onPreviewZoomModeChange: Dispatch<SetStateAction<PreviewZoomMode>>;
    findBarOpen: boolean;
    onFindBarOpenChange: (open: boolean) => void;
    findBarRef?: React.Ref<FindBarHandle>;
    previewRef?: React.Ref<PreviewHandle>;
}

export const Workspace = ({
    previewZoom,
    previewZoomMode,
    onPreviewZoomChange,
    onPreviewZoomModeChange,
    findBarOpen,
    onFindBarOpenChange,
    findBarRef,
    previewRef,
}: WorkspaceProps) => {
    const { state } = useDocumentAst();
    const { events, sessionId, ackDocumentEvents, eventsVersion, bootstrapFiles } =
        useDocumentSync();
    const preview = usePreviewSettings();
    const zoteroTranslationServerEnabled =
        useGlobalSettings().zotero_translation_server_enabled ?? false;
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
    // Tracks whether the toast currently on screen is the compile-error one, so a
    // later successful compile can dismiss it without wiping unrelated toasts.
    const compileErrorToastActiveRef = useRef(false);
    // Computed once here (heading-set selector, identity-stable while typing)
    // and shared by the sidebar outline and the editor's reference dialog.
    const outlineEntries = useOutlineEntries(compiler.outline);
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

    // Show the compile-error toast on every failed compile. `error` is reset to
    // null at the start of each sync, so this is the only reliable "show" signal.
    useEffect(() => {
        if (!compiler.error) {
            return;
        }
        compileErrorToastActiveRef.current = true;
        showToast(
            m.preview_compile_failed_toast({
                message: compiler.error,
            }),
        );
    }, [compiler.error, showToast]);

    // A successful compile advances the preview revision (only the success path
    // does). Use that — not a transient `error → null` — to dismiss a lingering
    // compile-error toast immediately instead of waiting out its auto-dismiss.
    useEffect(() => {
        if (
            compiler.previewRevision === null ||
            !compileErrorToastActiveRef.current
        ) {
            return;
        }
        compileErrorToastActiveRef.current = false;
        if (toastTimeoutRef.current !== null) {
            window.clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = null;
        }
        setToastMessage(null);
    }, [compiler.previewRevision]);

    useEffect(() => {
        void notifyUnavailableProjectFonts(state.metadata.project_settings);
    }, [sessionId]);

    useEffect(() => {
        // Register the toast handler so non-React modules (font notifications,
        // diagram rendering) can trigger toasts via the notifyBridge — a
        // system→UI feedback channel, separate from the user-intent action
        // runtime. Replaces the legacy ergo:toast CustomEvent.
        registerToastHandler((message) => {
            // Not a compile-error toast, so a later successful compile must not
            // clear it out from under the user.
            compileErrorToastActiveRef.current = false;
            showToast(message);
        });
        return () => registerToastHandler(null);
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
                            outlineEntries={outlineEntries}
                            resources={compiler.resources}
                            previewRevision={compiler.previewRevision}
                            resourcePreviewRevisions={
                                compiler.resourcePreviewRevisions
                            }
                            mainPreviewPaintedRevision={
                                compiler.mainPreviewPaintedRevision
                            }
                            previewScrollRef={previewScrollRef}
                            zoteroTranslationServerEnabled={
                                zoteroTranslationServerEnabled
                            }
                            previewRasterizationDebounceMs={
                                preview.rasterizationDebounceMs
                            }
                        />
                    </div>
                    <ColumnResizeHandle {...handle1} />
                    <div className={styles.column} style={editorStyle}>
                        <Editor
                            resources={compiler.resources}
                            outlineEntries={outlineEntries}
                            resourcePreviewRevisions={
                                compiler.resourcePreviewRevisions
                            }
                            mainPreviewPaintedRevision={
                                compiler.mainPreviewPaintedRevision
                            }
                            findBarOpen={findBarOpen}
                            onFindBarOpenChange={onFindBarOpenChange}
                            findBarRef={findBarRef}
                            previewRasterizationDebounceMs={
                                preview.rasterizationDebounceMs
                            }
                        />
                    </div>
                    <ColumnResizeHandle {...handle2} />
                    <div className={styles.column} style={previewStyle}>
                        <Preview
                            ref={previewRef}
                            compiler={compiler}
                            zoom={previewZoom}
                            zoomMode={previewZoomMode}
                            onZoomChange={onPreviewZoomChange}
                            onZoomModeChange={onPreviewZoomModeChange}
                            scrollRef={previewScrollRef}
                            draftRenderFactor={preview.draftRenderFactor}
                            renderOverscanFactor={preview.renderOverscanFactor}
                            rasterizationDebounceMs={preview.rasterizationDebounceMs}
                            revealDebounceMs={preview.revealDebounceMs}
                            forwardSyncDebounceMs={preview.forwardSyncDebounceMs}
                            draftPromoteMs={preview.draftPromoteMs}
                            multiCaret={preview.multiCaret}
                        />
                    </div>
                    {toastMessage ? <Toast message={toastMessage} /> : null}
                </div>
            </EditorFieldRegistryProvider>
        </TemplateSpecProvider>
    );
};
