import { memo } from "react";
import styles from "./LoadingIndicator.module.css";

export interface LoadingIndicatorProps {
    label: string;
    className?: string;
}

/** Spinner plus a status label; announced politely to assistive technology. */
export const LoadingIndicator = memo(({ label, className }: LoadingIndicatorProps) => (
    <div
        role="status"
        aria-live="polite"
        className={className ? `${styles.indicator} ${className}` : styles.indicator}
    >
        <span className={styles.spinner} aria-hidden="true" />
        <span className={styles.label}>{label}</span>
    </div>
));

LoadingIndicator.displayName = "LoadingIndicator";
