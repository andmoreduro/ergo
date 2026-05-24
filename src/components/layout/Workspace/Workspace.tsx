import { Sidebar } from "../Sidebar/Sidebar";
import { Editor } from "../Editor/Editor";
import { Preview } from "../Preview/Preview";
import { EditorFieldRegistryProvider } from "../../../state/EditorFieldRegistry";
import { TemplateSpecProvider } from "../../../state/TemplateSpecContext";
import { useDocumentAst, useDocumentSync } from "../../../state/DocumentContext";
import { useCompiler } from "../../../hooks/useCompiler";
import { useContextMenuTrigger } from "../../../contextMenu/ContextMenuProvider";
import styles from "./Workspace.module.css";

export const Workspace = () => {
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
                    />
                    <Editor />
                    <Preview compiler={compiler} />
                </div>
            </EditorFieldRegistryProvider>
        </TemplateSpecProvider>
    );
};
