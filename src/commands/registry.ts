import type { Command, CommandContext, CommandId } from "./types";

export interface CommandRegistry {
    all: () => Command[];
    get: (id: CommandId) => Command | undefined;
    enabled: (id: CommandId, context: CommandContext) => boolean;
    run: (id: CommandId, context: CommandContext) => Promise<boolean>;
}

export const createCommandRegistry = (commands: Command[]): CommandRegistry => {
    const commandMap = new Map(commands.map((command) => [command.id, command]));

    return {
        all: () => commands,
        get: (id) => commandMap.get(id),
        enabled: (id, context) => {
            const command = commandMap.get(id);
            if (!command) {
                return false;
            }

            return command.isEnabled ? command.isEnabled(context) : true;
        },
        run: async (id, context) => {
            const command = commandMap.get(id);
            if (!command || (command.isEnabled && !command.isEnabled(context))) {
                return false;
            }

            await command.run();
            return true;
        },
    };
};
