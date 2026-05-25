import type { ReactNode } from "react";
import styles from "./Sidebar.module.css";

export const SidebarResourceDialog = ({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) => (
    <div className={styles.dialogBackdrop}>
        <section
            aria-labelledby="resource-dialog-title"
            aria-modal="true"
            className={styles.resourceDialog}
            data-scroll-region
            role="dialog"
        >
            <header className={styles.dialogHeader}>
                <h2 id="resource-dialog-title">{title}</h2>
            </header>
            <div className={styles.dialogContent}>{children}</div>
        </section>
    </div>
);
