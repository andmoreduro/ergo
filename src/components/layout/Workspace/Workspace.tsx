import { Sidebar } from "../Sidebar/Sidebar";
import { Editor } from "../Editor/Editor";
import { Preview } from "../Preview/Preview";
import styles from "./Workspace.module.css";

export interface WorkspaceProps {
    previewDebounceMs?: number;
}

export const Workspace = ({ previewDebounceMs = 0 }: WorkspaceProps) => {
    return (
        <div className={styles.workspace}>
            <Sidebar />
            <Editor />
            <Preview previewDebounceMs={previewDebounceMs} />
        </div>
    );
};
