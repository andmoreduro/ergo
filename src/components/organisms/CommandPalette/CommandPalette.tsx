import { memo } from "react";
import type { Command } from "../../../commands/types";
import type { CommandContext } from "../../../commands/types";
import type { CommandRegistry } from "../../../commands/registry";
import { Dialog } from "../../molecules/Dialog/Dialog";
import { MenuItemButton } from "../../atoms/MenuItemButton/MenuItemButton";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { m } from "../../../paraglide/messages.js";
import styles from "./CommandPalette.module.css";

export interface CommandPaletteProps {
    query: string;
    onQueryChange: (query: string) => void;
    commands: Command[];
    commandRegistry: CommandRegistry;
    commandContext: CommandContext;
    onRunCommand: (commandId: Command["id"]) => void;
    onClose: () => void;
}

export const CommandPalette = memo(
    ({
        query,
        onQueryChange,
        commands,
        commandRegistry,
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
                    commands.map((command) => (
                        <MenuItemButton
                            key={command.id}
                            variant="commandPalette"
                            disabled={
                                !commandRegistry.enabled(command.id, commandContext)
                            }
                            onClick={() => onRunCommand(command.id)}
                        >
                            {command.label}
                        </MenuItemButton>
                    ))
                ) : (
                    <p className={styles.empty}>{m.command_palette_empty()}</p>
                )}
            </div>
        </Dialog>
    ),
);

CommandPalette.displayName = "CommandPalette";
