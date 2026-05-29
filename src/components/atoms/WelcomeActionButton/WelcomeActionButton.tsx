import { ButtonHTMLAttributes, forwardRef, memo, type ReactNode } from "react";
import styles from "./WelcomeActionButton.module.css";

export interface WelcomeActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    icon: ReactNode;
    shortcut?: ReactNode;
    variant?: "default" | "recent";
}

export const WelcomeActionButton = memo(
    forwardRef<HTMLButtonElement, WelcomeActionButtonProps>(
        (
            { icon, shortcut, variant = "default", children, className = "", ...props },
            ref,
        ) => {
            const classNames = [
                styles.button,
                variant === "recent" ? styles.recent : "",
                className,
            ]
                .filter(Boolean)
                .join(" ");

            return (
                <button ref={ref} type="button" className={classNames} {...props}>
                    <span className={styles.icon}>{icon}</span>
                    <span>{children}</span>
                    {shortcut ? <kbd className={styles.shortcut}>{shortcut}</kbd> : null}
                </button>
            );
        },
    ),
);

WelcomeActionButton.displayName = "WelcomeActionButton";
