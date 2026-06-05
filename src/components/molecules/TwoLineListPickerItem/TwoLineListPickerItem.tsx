import type { ReactNode } from "react";
import { MenuItemButton } from "../../atoms/MenuItemButton/MenuItemButton";
import styles from "./TwoLineListPickerItem.module.css";

export interface TwoLineListPickerItemProps {
    primary: ReactNode;
    secondary: ReactNode;
    onSelect: () => void;
    title?: string;
    className?: string;
}

export const TwoLineListPickerItem = ({
    primary,
    secondary,
    onSelect,
    title,
    className = "",
}: TwoLineListPickerItemProps) => (
    <MenuItemButton
        type="button"
        variant="listPicker"
        className={[styles.button, className].filter(Boolean).join(" ")}
        title={title}
        onClick={onSelect}
    >
        <span className={styles.primary}>{primary}</span>
        <small className={styles.secondary}>{secondary}</small>
    </MenuItemButton>
);
