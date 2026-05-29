import { ButtonHTMLAttributes, forwardRef, memo } from "react";
import styles from "./DisclosureButton.module.css";

export interface DisclosureButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    title: string;
    open?: boolean;
    variant?: "sidebar";
}

export const DisclosureButton = memo(
    forwardRef<HTMLButtonElement, DisclosureButtonProps>(
        ({ title, open = false, variant = "sidebar", className = "", ...props }, ref) => (
            <button
                ref={ref}
                type="button"
                className={[styles.button, styles[variant], className]
                    .filter(Boolean)
                    .join(" ")}
                aria-expanded={open}
                {...props}
            >
                <span className={styles.title}>{title}</span>
                <span className={`${styles.icon} ${open ? styles.iconOpen : ""}`}>
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden
                    >
                        <path
                            d="M6 9L12 15L18 9"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </span>
            </button>
        ),
    ),
);

DisclosureButton.displayName = "DisclosureButton";
