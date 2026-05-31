import { ButtonHTMLAttributes, forwardRef, memo } from "react";
import styles from "./MenuItemButton.module.css";

export type MenuItemButtonVariant =
    | "dropdown"
    | "commandPalette"
    | "listPicker"
    | "keymap";

export interface MenuItemButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: MenuItemButtonVariant;
}

export const MenuItemButton = memo(
    forwardRef<HTMLButtonElement, MenuItemButtonProps>(
        ({ variant = "dropdown", className = "", ...props }, ref) => {
            const classNames = [styles.button, styles[variant], className]
                .filter(Boolean)
                .join(" ");

            return <button ref={ref} type="button" className={classNames} {...props} />;
        },
    ),
);

MenuItemButton.displayName = "MenuItemButton";
