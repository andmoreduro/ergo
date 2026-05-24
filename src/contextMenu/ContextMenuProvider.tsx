import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
    type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { isDebugMenuEnabled } from "../config/debug";
import type { ActionId } from "../bindings/ActionId";
import type { CommandContext } from "../commands/types";
import type { CommandRegistry } from "../commands/registry";
import { TauriApi } from "../api/tauri";
import { m } from "../paraglide/messages.js";
import {
    CONTEXT_MENU_DEFINITIONS,
    type ContextMenuEntry,
    type ContextMenuSurface,
} from "./definitions";
import styles from "./ContextMenu.module.css";

type OpenMenuState = {
    x: number;
    y: number;
    surface: ContextMenuSurface;
};

interface ContextMenuContextValue {
    openContextMenu: (
        event: ReactMouseEvent,
        surface: ContextMenuSurface,
    ) => void;
}

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);

const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return Boolean(
        target.closest(
            "input, textarea, select, [contenteditable='true'], [contenteditable='']",
        ),
    );
};

const filterEntries = (
    entries: ContextMenuEntry[],
    debugEnabled: boolean,
): ContextMenuEntry[] =>
    entries.filter((entry) => {
        if (entry.type === "inspect") {
            return debugEnabled;
        }
        return true;
    });

const collapseSeparators = (entries: ContextMenuEntry[]): ContextMenuEntry[] => {
    const result: ContextMenuEntry[] = [];
    for (const entry of entries) {
        if (entry.type === "separator") {
            if (result.length === 0 || result[result.length - 1]?.type === "separator") {
                continue;
            }
        }
        result.push(entry);
    }
    if (result[result.length - 1]?.type === "separator") {
        result.pop();
    }
    return result;
};

interface ContextMenuProviderProps {
    children: ReactNode;
    commandRegistry: CommandRegistry;
    commandContext: CommandContext;
    runCommand: (commandId: ActionId) => void | Promise<void>;
}

export const ContextMenuProvider = ({
    children,
    commandRegistry,
    commandContext,
    runCommand,
}: ContextMenuProviderProps) => {
    const [openMenu, setOpenMenu] = useState<OpenMenuState | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const closeMenu = useCallback(() => {
        setOpenMenu(null);
    }, []);

    const openContextMenu = useCallback(
        (event: ReactMouseEvent, surface: ContextMenuSurface) => {
            if (isEditableTarget(event.target)) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            setOpenMenu({
                x: event.clientX,
                y: event.clientY,
                surface,
            });
        },
        [],
    );

    const contextValue = useMemo(
        () => ({
            openContextMenu,
        }),
        [openContextMenu],
    );

    const entries = useMemo(() => {
        if (!openMenu) {
            return [];
        }

        const raw = CONTEXT_MENU_DEFINITIONS[openMenu.surface];
        return collapseSeparators(
            filterEntries(raw, isDebugMenuEnabled()),
        );
    }, [openMenu]);

    useEffect(() => {
        if (!openMenu) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) {
                closeMenu();
                return;
            }
            if (menuRef.current?.contains(target)) {
                return;
            }
            closeMenu();
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeMenu();
            }
        };

        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [closeMenu, openMenu]);

    const handleSelect = async (entry: ContextMenuEntry) => {
        closeMenu();
        if (entry.type === "command") {
            await runCommand(entry.commandId);
            return;
        }
        if (entry.type === "inspect") {
            try {
                await TauriApi.openDevTools();
            } catch (error) {
                console.error("Failed to open DevTools:", error);
            }
        }
    };

    return (
        <ContextMenuContext.Provider value={contextValue}>
            {children}
            {openMenu &&
                entries.length > 0 &&
                createPortal(
                    <div
                        ref={menuRef}
                        className={styles.menu}
                        role="menu"
                        style={{
                            left: openMenu.x,
                            top: openMenu.y,
                        }}
                    >
                        {entries.map((entry, index) => {
                            if (entry.type === "separator") {
                                return (
                                    <div
                                        key={`sep-${index}`}
                                        className={styles.separator}
                                        role="separator"
                                    />
                                );
                            }

                            if (entry.type === "inspect") {
                                return (
                                    <button
                                        key="inspect"
                                        className={styles.item}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => void handleSelect(entry)}
                                    >
                                        {m.context_menu_inspect()}
                                    </button>
                                );
                            }

                            if (entry.type === "placeholder") {
                                return (
                                    <button
                                        key={entry.label}
                                        className={styles.item}
                                        type="button"
                                        role="menuitem"
                                        disabled
                                    >
                                        {entry.label}
                                    </button>
                                );
                            }

                            const command = commandRegistry.get(entry.commandId);
                            const label = command?.label ?? entry.commandId;
                            const enabled = commandRegistry.enabled(
                                entry.commandId,
                                commandContext,
                            );

                            return (
                                <button
                                    key={entry.commandId}
                                    className={styles.item}
                                    type="button"
                                    role="menuitem"
                                    disabled={!enabled}
                                    onClick={() => void handleSelect(entry)}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>,
                    document.body,
                )}
        </ContextMenuContext.Provider>
    );
};

export const useContextMenuTrigger = (surface: ContextMenuSurface) => {
    const context = useContext(ContextMenuContext);
    if (!context) {
        throw new Error("useContextMenuTrigger requires ContextMenuProvider");
    }

    return {
        onContextMenu: (event: ReactMouseEvent) => {
            context.openContextMenu(event, surface);
        },
    };
};
