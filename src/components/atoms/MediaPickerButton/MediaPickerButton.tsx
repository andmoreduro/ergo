import { ButtonHTMLAttributes, forwardRef, memo } from "react";
import styles from "./MediaPickerButton.module.css";

export type MediaPickerButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const MediaPickerButton = memo(
    forwardRef<HTMLButtonElement, MediaPickerButtonProps>(
        ({ className = "", children, ...props }, ref) => (
            <button
                ref={ref}
                type="button"
                className={[styles.button, className].filter(Boolean).join(" ")}
                {...props}
            >
                {children}
            </button>
        ),
    ),
);

MediaPickerButton.displayName = "MediaPickerButton";
