import { HTMLAttributes, memo, type ReactNode } from "react";
import styles from "./Toolbar.module.css";

export const Toolbar = memo(
    ({ className = "", children, ...props }: HTMLAttributes<HTMLElement>) => (
        <header
            className={[styles.toolbar, className].filter(Boolean).join(" ")}
            {...props}
        >
            {children}
        </header>
    ),
);

Toolbar.displayName = "Toolbar";

export const ToolbarGroup = memo(({ children }: { children: ReactNode }) => (
    <div className={styles.group}>{children}</div>
));

ToolbarGroup.displayName = "ToolbarGroup";

export const ToolbarSpacer = memo(() => <span className={styles.spacer} aria-hidden />);

ToolbarSpacer.displayName = "ToolbarSpacer";
