import { ButtonHTMLAttributes, forwardRef, memo } from "react";
import styles from "./MenubarMenuButton.module.css";

export interface MenubarMenuButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    open?: boolean;
}

export const MenubarMenuButton = memo(
    forwardRef<HTMLButtonElement, MenubarMenuButtonProps>(
        ({ open = false, className = "", ...props }, ref) => {
            const classNames = [styles.button, open ? styles.open : "", className]
                .filter(Boolean)
                .join(" ");

            return <button ref={ref} type="button" className={classNames} {...props} />;
        },
    ),
);

MenubarMenuButton.displayName = "MenubarMenuButton";
