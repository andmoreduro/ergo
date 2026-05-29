import { useEffect, useRef, useState } from "react";
import { ArrowDownload24Regular, ChevronDown24Regular } from "@fluentui/react-icons";
import type { ExportFormat } from "../../../bindings/ExportFormat";
import { MenuItemButton } from "../../atoms/MenuItemButton/MenuItemButton";
import { ToolbarTextButton } from "../../atoms/ToolbarTextButton/ToolbarTextButton";
import { m } from "../../../paraglide/messages.js";
import styles from "./ExportMenu.module.css";

export interface ExportMenuProps {
    onExport: (format: ExportFormat) => void | Promise<void>;
}

const formats: ExportFormat[] = ["pdf", "png", "svg"];

const formatLabel = (format: ExportFormat): string => {
    switch (format) {
        case "pdf":
            return m.export_format_pdf();
        case "png":
            return m.export_format_png();
        case "svg":
            return m.export_format_svg();
    }
};

export const ExportMenu = ({ onExport }: ExportMenuProps) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        window.addEventListener("mousedown", handlePointerDown);
        return () => window.removeEventListener("mousedown", handlePointerDown);
    }, [open]);

    return (
        <div className={styles.root} ref={rootRef}>
            <ToolbarTextButton
                aria-expanded={open}
                aria-haspopup="menu"
                onClick={() => setOpen((current) => !current)}
            >
                <ArrowDownload24Regular aria-hidden />
                {m.menubar_export()}
                <ChevronDown24Regular />
            </ToolbarTextButton>
            {open && (
                <ul className={styles.menu} role="menu">
                    {formats.map((format) => (
                        <li key={format} role="none">
                            <MenuItemButton
                                role="menuitem"
                                variant="export"
                                onClick={() => {
                                    setOpen(false);
                                    void onExport(format);
                                }}
                            >
                                {formatLabel(format)}
                            </MenuItemButton>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
