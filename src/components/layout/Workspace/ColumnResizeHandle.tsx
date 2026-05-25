import type { PointerEventHandler } from "react";
import styles from "./Workspace.module.css";

export interface ColumnResizeHandleProps {
    active: boolean;
    onPointerDown: PointerEventHandler<HTMLDivElement>;
    onPointerEnter: () => void;
    onPointerLeave: () => void;
}

export const ColumnResizeHandle = ({
    active,
    onPointerDown,
    onPointerEnter,
    onPointerLeave,
}: ColumnResizeHandleProps) => (
    <div
        role="separator"
        aria-orientation="vertical"
        className={`${styles.resizeHandle} ${active ? styles.resizeHandleActive : ""}`}
        onPointerDown={onPointerDown}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
    />
);
