import { memo } from "react";
import styles from "./Toast.module.css";

export interface ToastProps {
    message: string;
}

export const Toast = memo(({ message }: ToastProps) => (
    <div className={styles.toast} role="alert">
        {message}
    </div>
));

Toast.displayName = "Toast";
