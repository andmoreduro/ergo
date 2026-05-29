import { ButtonHTMLAttributes, forwardRef, memo } from "react";
import styles from "./IconButton.module.css";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "toolbar" | "extras";
}

export const IconButton = memo(
    forwardRef<HTMLButtonElement, IconButtonProps>(
        ({ className = "", variant = "toolbar", children, ...props }, ref) => {
            const classNames = [
                styles.button,
                variant === "extras" ? styles.extras : "",
                className,
            ]
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

IconButton.displayName = "IconButton";
