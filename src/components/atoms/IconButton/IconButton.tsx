import { ButtonHTMLAttributes, forwardRef, memo } from "react";
import styles from "./IconButton.module.css";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "toolbar" | "extras";
    pressed?: boolean;
}

export const IconButton = memo(
    forwardRef<HTMLButtonElement, IconButtonProps>(
        (
            {
                className = "",
                variant = "toolbar",
                pressed = false,
                children,
                ...props
            },
            ref,
        ) => {
            const classNames = [
                styles.button,
                variant === "extras" ? styles.extras : "",
                pressed ? styles.pressed : "",
                className,
            ]
                .filter(Boolean)
                .join(" ");

            return (
                <button
                    ref={ref}
                    type="button"
                    className={classNames}
                    aria-pressed={pressed}
                    {...props}
                >
                    {children}
                </button>
            );
        },
    ),
);

IconButton.displayName = "IconButton";
