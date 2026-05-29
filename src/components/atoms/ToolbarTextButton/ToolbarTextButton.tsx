import { ButtonHTMLAttributes, forwardRef, memo } from "react";
import styles from "./ToolbarTextButton.module.css";

export interface ToolbarTextButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "zoom";
}

export const ToolbarTextButton = memo(
    forwardRef<HTMLButtonElement, ToolbarTextButtonProps>(
        ({ variant = "default", className = "", children, ...props }, ref) => {
            const classNames = [styles.button, variant === "zoom" ? styles.zoom : "", className]
                .filter(Boolean)
                .join(" ");

            return (
                <button ref={ref} type="button" className={classNames} {...props}>
                    {children}
                </button>
            );
        },
    ),
);

ToolbarTextButton.displayName = "ToolbarTextButton";
