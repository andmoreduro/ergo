import { ButtonHTMLAttributes, forwardRef, memo } from "react";
import styles from "./HoverRevealDismissButton.module.css";

export type HoverRevealDismissButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const HoverRevealDismissButton = memo(
    forwardRef<HTMLButtonElement, HoverRevealDismissButtonProps>(
        ({ className = "", children, ...props }, ref) => {
            const classNames = [styles.button, className].filter(Boolean).join(" ");

            return (
                <button ref={ref} type="button" className={classNames} {...props}>
                    {children}
                </button>
            );
        },
    ),
);

HoverRevealDismissButton.displayName = "HoverRevealDismissButton";
