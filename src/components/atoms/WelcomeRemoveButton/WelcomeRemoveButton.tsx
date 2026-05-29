import { ButtonHTMLAttributes, forwardRef, memo } from "react";
import styles from "./WelcomeRemoveButton.module.css";

export type WelcomeRemoveButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const WelcomeRemoveButton = memo(
    forwardRef<HTMLButtonElement, WelcomeRemoveButtonProps>(
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

WelcomeRemoveButton.displayName = "WelcomeRemoveButton";
