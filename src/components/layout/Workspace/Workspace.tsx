import { Sidebar } from "../Sidebar/Sidebar";
import { Editor } from "../Editor/Editor";
import { Preview } from "../Preview/Preview";
import styles from "./Workspace.module.css";

export const Workspace = () => {
    return (
        <div className={styles.workspace}>
            <Sidebar />
            <Editor />
            <Preview />
        </div>
    );
};
