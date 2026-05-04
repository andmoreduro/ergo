import { describe, expect, it, vi } from "vitest";
import { createCommandRegistry } from "./registry";
import type { CommandContext } from "./types";

const context: CommandContext = {
    hasActiveProject: true,
    focusedElementId: null,
};

describe("command registry", () => {
    it("dispatches enabled commands by stable id", async () => {
        const run = vi.fn();
        const registry = createCommandRegistry([
            {
                id: "workspace::NewProject",
                label: "New Project",
                scope: "global",
                run,
            },
        ]);

        await expect(registry.run("workspace::NewProject", context)).resolves.toBe(true);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("does not dispatch disabled commands", async () => {
        const run = vi.fn();
        const registry = createCommandRegistry([
            {
                id: "workspace::SaveProject",
                label: "Save Project",
                scope: "project",
                isEnabled: (commandContext) => commandContext.hasActiveProject,
                run,
            },
        ]);

        await expect(
            registry.run("workspace::SaveProject", {
                hasActiveProject: false,
                focusedElementId: null,
            }),
        ).resolves.toBe(false);
        expect(run).not.toHaveBeenCalled();
    });
});
