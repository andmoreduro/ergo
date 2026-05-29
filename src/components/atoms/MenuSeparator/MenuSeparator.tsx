import { memo } from "react";
import styles from "./MenuSeparator.module.css";

export const MenuSeparator = memo(
    ({ variant = "contextMenu" }: { variant?: "contextMenu" }) => (
        <div
            className={`${styles.separator} ${styles[variant]}`}
            role="separator"
        />
    ),
);

MenuSeparator.displayName = "MenuSeparator";
