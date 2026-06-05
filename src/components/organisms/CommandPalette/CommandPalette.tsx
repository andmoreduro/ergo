import { memo } from "react";
import type { Command, CommandContext, KeymapProfile } from "../../../commands/types";
import { lookupActionShortcut } from "../../../settings/keymap";
import { Dialog } from "../../molecules/Dialog/Dialog";
import { MenuItemButton } from "../../atoms/MenuItemButton/MenuItemButton";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { m } from "../../../paraglide/messages.js";
import styles from "./CommandPalette.module.css";

export interface CommandPaletteProps {
    query: string;
    onQueryChange: (query: string) => void;
    commands: Command[];
    keymap: KeymapProfile;
    commandContext: CommandContext;
    onRunCommand: (commandId: Command["id"]) => void;
    onClose: () => void;
}

export const CommandPalette = memo(
    ({
        query,
        onQueryChange,
        commands,
        keymap,
        commandContext,
        onRunCommand,
        onClose,
    }: CommandPaletteProps) => (
        <Dialog
            size="md"
            title={m.command_palette_title()}
            titleId="command-palette-title"
            zIndex={2000}
            cancelAction={{
                label: m.command_palette_close(),
                onClick: onClose,
            }}
            onBackdropClick={onClose}
        >
            <TextInput
                autoFocus
                fullWidth
                variant="borderless"
                value={query}
                aria-label={m.command_palette_placeholder()}
                placeholder={m.command_palette_placeholder()}
                onChange={(event) => onQueryChange(event.target.value)}
            />
            <div className={styles.commandList}>
                {commands.length > 0 ? (
                    commands.map((command) => {
                        const shortcut = lookupActionShortcut(keymap, command.id);
                        return (
                            <MenuItemButton
                                key={command.id}
                                variant="listPicker"
                                disabled={
                                    command.isEnabled
                                        ? !command.isEnabled(commandContext)
                                        : false
                                }
                                onClick={() => onRunCommand(command.id)}
                            >
                                <span>{command.label}</span>
                                {shortcut ? <small>{shortcut}</small> : null}
                            </MenuItemButton>
                        );
                    })
                ) : (
                    <p className={styles.empty}>{m.command_palette_empty()}</p>
                )}
            </div>
        </Dialog>
    ),
);

CommandPalette.displayName = "CommandPalette";
