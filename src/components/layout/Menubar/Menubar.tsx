import { useState } from "react";
import { m } from "../../../paraglide/messages.js";
import { locales } from "../../../paraglide/runtime.js";
import type { Locale } from "../../../paraglide/runtime.js";
import type { CommandId } from "../../../commands/types";
import styles from "./Menubar.module.css";

export type InsertElementType =
    | "heading"
    | "paragraph"
    | "table"
    | "figure"
    | "equation";

export type ThemeMode = "system" | "light" | "dark";

interface MenuAction {
    label: string;
    commandId?: CommandId;
}

interface MenuGroup {
    title: string;
    actions: MenuAction[];
}

export interface MenubarProps {
    activeLocale: Locale;
    themeMode: ThemeMode;
    onLocaleChange: (locale: Locale) => void;
    onCommand: (commandId: CommandId) => void;
    isCommandEnabled: (commandId: CommandId) => boolean;
}

export const Menubar = ({
    activeLocale,
    themeMode,
    onLocaleChange,
    onCommand,
    isCommandEnabled,
}: MenubarProps) => {
    const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);

    const menuGroups: MenuGroup[] = [
        {
            title: m.menubar_file(),
            actions: [
                { label: m.menubar_new_project(), commandId: "workspace::NewProject" },
                { label: m.menubar_open_project(), commandId: "workspace::OpenProject" },
                { label: m.menubar_open_recent() },
                { label: m.menubar_save_project(), commandId: "workspace::SaveProject" },
                { label: m.menubar_export(), commandId: "workspace::ExportSvg" },
                { label: m.menubar_close_project(), commandId: "workspace::CloseProject" },
            ],
        },
        {
            title: m.menubar_edit(),
            actions: [
                { label: m.menubar_undo(), commandId: "edit::Undo" },
                { label: m.menubar_redo(), commandId: "edit::Redo" },
                { label: m.menubar_cut() },
                { label: m.menubar_copy() },
                { label: m.menubar_paste() },
                { label: m.menubar_delete_element(), commandId: "editor::DeleteElement" },
            ],
        },
        {
            title: m.menubar_insert(),
            actions: [
                {
                    label: m.menubar_insert_paragraph(),
                    commandId: "editor::InsertParagraph",
                },
                {
                    label: m.menubar_insert_heading(),
                    commandId: "editor::InsertHeading",
                },
                {
                    label: m.menubar_insert_table(),
                    commandId: "editor::InsertTable",
                },
                {
                    label: m.menubar_insert_figure(),
                    commandId: "editor::InsertFigure",
                },
                {
                    label: m.menubar_insert_equation(),
                    commandId: "editor::InsertEquation",
                },
                { label: m.menubar_insert_reference(), commandId: "editor::InsertReference" },
            ],
        },
        {
            title: m.menubar_view(),
            actions: [
                {
                    label: m.menubar_command_palette(),
                    commandId: "view::OpenCommandPalette",
                },
                { label: m.menubar_zoom_in(), commandId: "view::ZoomIn" },
                { label: m.menubar_zoom_out(), commandId: "view::ZoomOut" },
                {
                    label: `${themeMode === "system" ? "* " : ""}${m.menubar_theme_system()}`,
                    commandId: "theme::UseSystem",
                },
                {
                    label: `${themeMode === "light" ? "* " : ""}${m.menubar_theme_light()}`,
                    commandId: "theme::UseLight",
                },
                {
                    label: `${themeMode === "dark" ? "* " : ""}${m.menubar_theme_dark()}`,
                    commandId: "theme::UseDark",
                },
            ],
        },
        {
            title: m.menubar_options(),
            actions: [
                { label: m.menubar_global_settings(), commandId: "settings::OpenGlobal" },
                { label: m.menubar_project_settings(), commandId: "settings::OpenProject" },
                { label: m.menubar_keymap_settings(), commandId: "settings::OpenKeymap" },
            ],
        },
        {
            title: m.menubar_help(),
            actions: [
                { label: m.menubar_documentation(), commandId: "help::OpenDocumentation" },
                { label: m.menubar_about(), commandId: "help::OpenAbout" },
            ],
        },
    ];

    return (
        <nav className={styles.menubar} aria-label="Application menu">
            <div className={styles.menuGroups}>
                {menuGroups.map((group, index) => {
                    const isOpen = openMenuIndex === index;
                    const menuId = `menubar-menu-${index}`;

                    return (
                        <div
                            className={styles.menuItem}
                            key={group.title}
                            onMouseEnter={() => {
                                if (openMenuIndex !== null) {
                                    setOpenMenuIndex(index);
                                }
                            }}
                        >
                            <button
                                aria-controls={menuId}
                                aria-expanded={isOpen}
                                aria-haspopup="menu"
                                className={`${styles.menuTitle} ${
                                    isOpen ? styles.open : ""
                                }`}
                                type="button"
                                onClick={() =>
                                    setOpenMenuIndex(isOpen ? null : index)
                                }
                            >
                                {group.title}
                            </button>
                            {isOpen && (
                                <div
                                    aria-label={group.title}
                                    className={styles.dropdown}
                                    id={menuId}
                                    role="menu"
                                >
                                    {group.actions.map((action) => (
                                        <button
                                            className={styles.dropdownItem}
                                            disabled={
                                                !action.commandId ||
                                                !isCommandEnabled(action.commandId)
                                            }
                                            type="button"
                                            role="menuitem"
                                            key={action.label}
                                            onClick={() => {
                                                setOpenMenuIndex(null);
                                                if (action.commandId) {
                                                    onCommand(action.commandId);
                                                }
                                            }}
                                        >
                                            {action.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <label className={styles.language}>
                <span>{m.menubar_language()}</span>
                <select
                    value={activeLocale}
                    onChange={(event) =>
                        onLocaleChange(event.target.value as Locale)
                    }
                >
                    {locales.map((locale) => (
                        <option value={locale} key={locale}>
                            {locale === "es"
                                ? m.menubar_language_spanish()
                                : m.menubar_language_english()}
                        </option>
                    ))}
                </select>
            </label>
        </nav>
    );
};
