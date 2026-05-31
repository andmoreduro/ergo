import { forwardRef, memo, type HTMLAttributes } from "react";
import styles from "./MenuPanel.module.css";

export interface MenuPanelProps extends HTMLAttributes<HTMLDivElement> {
    scrollable?: boolean;
}

export const MenuPanel = memo(
    forwardRef<HTMLDivElement, MenuPanelProps>(
        ({ className = "", scrollable = false, role = "menu", ...props }, ref) => (
            <div
                ref={ref}
                className={[styles.panel, className].filter(Boolean).join(" ")}
                data-scroll-region={scrollable ? true : undefined}
                role={role}
                {...props}
            />
        ),
    ),
);

MenuPanel.displayName = "MenuPanel";
