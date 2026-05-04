import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ActionContextSnapshot } from "../bindings/ActionContextSnapshot";
import { TauriApi } from "../api/tauri";
import {
    ActionContextProvider,
    ActionRuntimeProvider,
    useActionDispatcher,
} from "./runtime";

import "@testing-library/jest-dom";

vi.mock("../api/tauri", () => ({
    TauriApi: {
        resolveKeyEvent: vi.fn(),
        resetKeySequence: vi.fn(),
    },
}));

const DispatchButton = ({ id }: { id: "view::OpenCommandPalette" }) => {
    const dispatchAction = useActionDispatcher();

    return (
        <button
            type="button"
            onClick={() => void dispatchAction({ id, payload: null })}
        >
            Dispatch
        </button>
    );
};

describe("ActionRuntimeProvider", () => {
    it("dispatches mouse actions through the focused context before parents", async () => {
        const appHandler = vi.fn();
        const editorHandler = vi.fn();

        render(
            <ActionRuntimeProvider>
                <ActionContextProvider
                    id="app"
                    contexts={["app"]}
                    handlers={{ "view::OpenCommandPalette": appHandler }}
                >
                    <ActionContextProvider
                        id="editor"
                        contexts={["editor"]}
                        handlers={{ "view::OpenCommandPalette": editorHandler }}
                    >
                        <DispatchButton id="view::OpenCommandPalette" />
                    </ActionContextProvider>
                </ActionContextProvider>
            </ActionRuntimeProvider>,
        );

        const button = screen.getByRole("button", { name: "Dispatch" });
        fireEvent.mouseDown(button);
        fireEvent.click(button);

        await waitFor(() => expect(editorHandler).toHaveBeenCalledTimes(1));
        expect(appHandler).not.toHaveBeenCalled();
    });

    it("propagates unhandled actions to parent contexts", async () => {
        const appHandler = vi.fn();
        const editorHandler = vi.fn(() => false);

        render(
            <ActionRuntimeProvider>
                <ActionContextProvider
                    id="app"
                    contexts={["app"]}
                    handlers={{ "view::OpenCommandPalette": appHandler }}
                >
                    <ActionContextProvider
                        id="editor"
                        contexts={["editor"]}
                        handlers={{ "view::OpenCommandPalette": editorHandler }}
                    >
                        <DispatchButton id="view::OpenCommandPalette" />
                    </ActionContextProvider>
                </ActionContextProvider>
            </ActionRuntimeProvider>,
        );

        const button = screen.getByRole("button", { name: "Dispatch" });
        fireEvent.mouseDown(button);
        fireEvent.click(button);

        await waitFor(() => expect(appHandler).toHaveBeenCalledTimes(1));
        expect(editorHandler).toHaveBeenCalledTimes(1);
    });

    it("sends logical key events and context snapshots to the Rust resolver", async () => {
        const appHandler = vi.fn();
        vi.mocked(TauriApi.resolveKeyEvent).mockResolvedValue({
            status: "matched",
            invocation: {
                id: "view::OpenCommandPalette",
                payload: null,
            },
        });

        render(
            <ActionRuntimeProvider>
                <ActionContextProvider
                    id="app"
                    contexts={["app"]}
                    handlers={{ "view::OpenCommandPalette": appHandler }}
                >
                    <button type="button">Focusable</button>
                </ActionContextProvider>
            </ActionRuntimeProvider>,
        );

        fireEvent.keyDown(window, {
            key: "P",
            ctrlKey: true,
            shiftKey: true,
        });

        await waitFor(() => expect(appHandler).toHaveBeenCalledTimes(1));
        expect(TauriApi.resolveKeyEvent).toHaveBeenCalledWith(
            {
                window_id: "main",
                key: "p",
                modifiers: ["Control", "Shift"],
            },
            expect.objectContaining<ActionContextSnapshot>({
                window_id: "main",
                focused_context_id: "app",
                nodes: expect.arrayContaining([
                    expect.objectContaining({
                        id: "app",
                        contexts: ["app"],
                    }),
                ]),
            }),
        );
    });

    it("adds input context instead of hard-blocking editable shortcuts", async () => {
        vi.mocked(TauriApi.resolveKeyEvent).mockResolvedValue({
            status: "noMatch",
        });

        render(
            <ActionRuntimeProvider>
                <ActionContextProvider id="app" contexts={["app"]}>
                    <input aria-label="Editable" />
                </ActionContextProvider>
            </ActionRuntimeProvider>,
        );

        fireEvent.keyDown(screen.getByLabelText("Editable"), {
            key: "z",
            ctrlKey: true,
        });

        await waitFor(() => expect(TauriApi.resolveKeyEvent).toHaveBeenCalled());
        const [, snapshot] = vi.mocked(TauriApi.resolveKeyEvent).mock.calls.at(-1)!;

        expect(snapshot).toEqual(
            expect.objectContaining({
                focused_context_id: "active-input",
                nodes: expect.arrayContaining([
                    expect.objectContaining({
                        id: "active-input",
                        contexts: ["input"],
                    }),
                ]),
            }),
        );
    });
});
