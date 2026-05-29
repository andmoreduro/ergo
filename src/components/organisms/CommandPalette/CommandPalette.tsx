import { memo } from "react";
import type { Command } from "../../../commands/types";
import type { CommandContext } from "../../../commands/types";
import type { CommandRegistry } from "../../../commands/registry";
import { Button } from "../../atoms/Button/Button";
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
        <div className={styles.backdrop}>
            <div className={styles.panel} role="dialog" aria-modal="true">
                <div className={styles.header}>
                    <h2>{m.command_palette_title()}</h2>
                    <Button type="button" variant="ghost" size="small" onClick={onClose}>
                        {m.command_palette_close()}
                    </Button>
                </div>
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
            </div>
        </div>
    ),
);

CommandPalette.displayName = "CommandPalette";
