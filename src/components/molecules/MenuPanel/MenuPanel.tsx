import { forwardRef, memo, type HTMLAttributes } from "react";
import styles from "./MenuPanel.module.css";

export type MenuPanelProps = HTMLAttributes<HTMLDivElement>;

export const MenuPanel = memo(
    forwardRef<HTMLDivElement, MenuPanelProps>(
        ({ className = "", role = "menu", ...props }, ref) => (
            <div
                ref={ref}
                className={[styles.panel, className].filter(Boolean).join(" ")}
                role={role}
                {...props}
            />
        ),
    ),
);

MenuPanel.displayName = "MenuPanel";
