import { Sidebar } from "../Sidebar/Sidebar";
import { Editor } from "../Editor/Editor";
import { Preview } from "../Preview/Preview";
import { EditorFieldRegistryProvider } from "../../../state/EditorFieldRegistry";
import { TemplateSpecProvider } from "../../../state/TemplateSpecContext";
import { useDocumentAst, useDocumentSync } from "../../../state/DocumentContext";
import { useCompiler } from "../../../hooks/useCompiler";
import styles from "./Workspace.module.css";

export const Workspace = () => {
    const { state } = useDocumentAst();
    const { events, sessionId, ackDocumentEvents, eventsVersion } =
        useDocumentSync();
    const compiler = useCompiler(
        state,
        events,
        sessionId,
        ackDocumentEvents,
        eventsVersion,
    );

    return (
        <TemplateSpecProvider templateId={state.metadata.template_id}>
            <EditorFieldRegistryProvider>
                <div className={styles.workspace}>
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
