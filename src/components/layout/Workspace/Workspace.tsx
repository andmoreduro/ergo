import { Sidebar } from "../Sidebar/Sidebar";
import { Editor } from "../Editor/Editor";
import { Preview } from "../Preview/Preview";
import { EditorFieldRegistryProvider } from "../../../state/EditorFieldRegistry";
import styles from "./Workspace.module.css";

export interface WorkspaceProps {
    previewDebounceMs?: number;
}

export const Workspace = ({ previewDebounceMs = 0 }: WorkspaceProps) => {
    return (
        <EditorFieldRegistryProvider>
            <div className={styles.workspace}>
                <Sidebar />
                <Editor />
                <Preview previewDebounceMs={previewDebounceMs} />
            </div>
        </EditorFieldRegistryProvider>
    );
};
