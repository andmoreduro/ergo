import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ErgoThemeLogo } from "../../atoms/ErgoThemeLogo/ErgoThemeLogo";
import { MenubarMenuButton } from "../../atoms/MenubarMenuButton/MenubarMenuButton";
import { MenuItemButton } from "../../atoms/MenuItemButton/MenuItemButton";
import { WindowControlButton } from "../../atoms/WindowControlButton/WindowControlButton";
import { DropdownMenu } from "../../molecules/DropdownMenu/DropdownMenu";
import { m } from "../../../paraglide/messages.js";
import type { ActionId } from "../../../commands/types";
import styles from "./Menubar.module.css";

export type InsertElementType =
    | "heading"
    | "paragraph"
    | "table"
    | "figure"
    | "equation";

interface MenuAction {
    label: string;
    commandId?: ActionId;
}

interface MenuGroup {
    title: string;
    actions: MenuAction[];
}

export interface MenubarProps {
    hasActiveProject: boolean;
    onCommand: (commandId: ActionId) => void;
    isCommandEnabled: (commandId: ActionId) => boolean;
}

export const Menubar = ({
    hasActiveProject,
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
                {
                    label: m.menubar_open_recent(),
                    commandId: "workspace::OpenRecentProject",
                },
                ...(hasActiveProject
                    ? [
                          {
                              label: m.menubar_save_project(),
                              commandId: "workspace::SaveProject" as const,
                          },
                          {
                              label: m.menubar_export(),
                              commandId: "workspace::ExportSvg" as const,
                          },
                          {
                              label: m.menubar_close_project(),
                              commandId: "workspace::CloseProject" as const,
                          },
                      ]
                    : []),
            ],
        },
        ...(hasActiveProject
            ? [
                  {
                      title: m.menubar_insert(),
                      actions: [
                          {
                              label: m.menubar_insert_paragraph(),
                              commandId: "editor::InsertParagraph" as const,
                          },
                          {
                              label: m.menubar_insert_heading(),
                              commandId: "editor::InsertHeading" as const,
                          },
                          {
                              label: m.menubar_insert_table(),
                              commandId: "editor::InsertTable" as const,
                          },
                          {
                              label: m.menubar_insert_figure(),
                              commandId: "editor::InsertFigure" as const,
                          },
                          {
                              label: m.menubar_insert_equation(),
                              commandId: "editor::InsertEquation" as const,
                          },
                          {
                              label: m.menubar_insert_reference(),
                              commandId: "editor::InsertReference" as const,
                          },
                      ],
                  },
              ]
            : []),
        {
            title: m.menubar_view(),
            actions: [
                {
                    label: m.menubar_command_palette(),
                    commandId: "view::OpenCommandPalette",
                },
                ...(hasActiveProject
                    ? [
                          {
                              label: m.menubar_zoom_in(),
                              commandId: "view::ZoomIn" as const,
                          },
                          {
                              label: m.menubar_zoom_out(),
                              commandId: "view::ZoomOut" as const,
                          },
                      ]
                    : []),
            ],
        },
        {
            title: m.menubar_settings(),
            actions: [
                { label: m.menubar_global_settings(), commandId: "settings::OpenGlobal" },
                ...(hasActiveProject
                    ? [
                          {
                              label: m.menubar_project_settings(),
                              commandId: "settings::OpenProject" as const,
                          },
                      ]
                    : []),
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

    const minimizeWindow = () => {
        void getCurrentWindow().minimize();
    };

    const toggleMaximizeWindow = () => {
        void getCurrentWindow().toggleMaximize();
    };

    const closeWindow = () => {
        void getCurrentWindow().close();
    };

    return (
        <nav
            className={styles.menubar}
            aria-label="Application menu"
            data-tauri-drag-region=""
        >
            <ErgoThemeLogo
                className={styles.brandLogo}
                alt={m.welcome_app_icon_label()}
                width={32}
                height={32}
                draggable={false}
            />
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
                            <DropdownMenu
                                align="start"
                                menuId={menuId}
                                menuLabel={group.title}
                                open={isOpen}
                                onOpenChange={(open) =>
                                    setOpenMenuIndex(open ? index : null)
                                }
                                trigger={
                                    <MenubarMenuButton open={isOpen}>
                                        {group.title}
                                    </MenubarMenuButton>
                                }
                            >
                                {group.actions.map((action) => (
                                    <MenuItemButton
                                        disabled={
                                            !action.commandId ||
                                            !isCommandEnabled(action.commandId)
                                        }
                                        key={action.label}
                                        role="menuitem"
                                        variant="dropdown"
                                        onClick={() => {
                                            setOpenMenuIndex(null);
                                            if (action.commandId) {
                                                onCommand(action.commandId);
                                            }
                                        }}
                                    >
                                        {action.label}
                                    </MenuItemButton>
                                ))}
                            </DropdownMenu>
                        </div>
                    );
                })}
            </div>

            <div className={styles.dragRegion} data-tauri-drag-region="" />
            <div className={styles.windowControls}>
                <WindowControlButton
                    aria-label={m.titlebar_minimize()}
                    title={m.titlebar_minimize()}
                    onClick={minimizeWindow}
                >
                    <svg aria-hidden="true" viewBox="0 0 12 12">
                        <path d="M2 6h8" />
                    </svg>
                </WindowControlButton>
                <WindowControlButton
                    aria-label={m.titlebar_maximize()}
                    title={`${m.titlebar_maximize()} / ${m.titlebar_restore()}`}
                    onClick={toggleMaximizeWindow}
                >
                    <svg aria-hidden="true" viewBox="0 0 12 12">
                        <rect x="3" y="3" width="6" height="6" />
                    </svg>
                </WindowControlButton>
                <WindowControlButton
                    variant="close"
                    aria-label={m.titlebar_close()}
                    title={m.titlebar_close()}
                    onClick={closeWindow}
                >
                    <svg aria-hidden="true" viewBox="0 0 12 12">
                        <path d="M3 3l6 6M9 3L3 9" />
                    </svg>
                </WindowControlButton>
            </div>
        </nav>
    );
};
