import { ButtonHTMLAttributes, forwardRef, memo } from "react";
import styles from "./NavItemButton.module.css";

export type NavItemButtonVariant = "sidebar" | "outline";

export interface NavItemButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: NavItemButtonVariant;
}

export const NavItemButton = memo(
    forwardRef<HTMLButtonElement, NavItemButtonProps>(
        ({ variant = "sidebar", className = "", style, ...props }, ref) => (
            <button
                ref={ref}
                type="button"
                className={[styles.button, styles[variant], className]
                    .filter(Boolean)
                    .join(" ")}
                style={style}
                {...props}
            />
        ),
    ),
);

NavItemButton.displayName = "NavItemButton";
