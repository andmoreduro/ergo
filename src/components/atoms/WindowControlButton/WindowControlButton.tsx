import { ButtonHTMLAttributes, forwardRef, memo } from "react";
import styles from "./WindowControlButton.module.css";

export interface WindowControlButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "close";
}

export const WindowControlButton = memo(
    forwardRef<HTMLButtonElement, WindowControlButtonProps>(
        ({ variant = "default", className = "", ...props }, ref) => {
            const classNames = [
                styles.button,
                variant === "close" ? styles.close : "",
                className,
            ]
                .filter(Boolean)
                .join(" ");

            return <button ref={ref} type="button" className={classNames} {...props} />;
        },
    ),
);

WindowControlButton.displayName = "WindowControlButton";
