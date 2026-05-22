import { useState } from "react";
import { Sidebar } from "../Sidebar/Sidebar";
import { Editor } from "../Editor/Editor";
import { Preview } from "../Preview/Preview";
import type { DocumentOutline } from "../../../bindings/DocumentOutline";
import type { DocumentResources } from "../../../bindings/DocumentResources";
import { EditorFieldRegistryProvider } from "../../../state/EditorFieldRegistry";
import styles from "./Workspace.module.css";

export interface WorkspaceProps {
    previewDebounceMs?: number;
}

export const Workspace = ({ previewDebounceMs = 0 }: WorkspaceProps) => {
    const [outline, setOutline] = useState<DocumentOutline | null>(null);
    const [resources, setResources] = useState<DocumentResources | null>(null);
    const [previewRevision, setPreviewRevision] = useState<number | null>(null);

    return (
        <EditorFieldRegistryProvider>
            <div className={styles.workspace}>
                <Sidebar
                    outline={outline}
                    resources={resources}
                    previewRevision={previewRevision}
                />
                <Editor />
                <Preview
                    previewDebounceMs={previewDebounceMs}
                    onOutlineChange={setOutline}
                    onResourcesChange={setResources}
                    onPreviewRevisionChange={setPreviewRevision}
                />
            </div>
        </EditorFieldRegistryProvider>
    );
};
