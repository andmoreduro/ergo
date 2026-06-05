import { describe, expect, it, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Dialog } from "./Dialog";

describe("Dialog keyboard shortcuts", () => {
    let container: HTMLDivElement;
    let root: ReturnType<typeof createRoot>;

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    const renderDialog = (props: Parameters<typeof Dialog>[0]) => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => {
            root.render(<Dialog {...props} />);
        });
    };

    const dispatchEnter = (init: KeyboardEventInit = {}) => {
        act(() => {
            document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", bubbles: true, ...init }),
            );
        });
    };

    it("Escape triggers cancel when provided", () => {
        const onCancel = vi.fn();
        renderDialog({
            title: "Test",
            titleId: "test-title",
            cancelAction: { label: "Cancel", onClick: onCancel },
            children: "Body",
        });

        act(() => {
            document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
        });

        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("Ctrl+Enter triggers confirm when provided", () => {
        const onConfirm = vi.fn();
        renderDialog({
            title: "Test",
            titleId: "test-title",
            confirmAction: { label: "OK", onClick: onConfirm },
            children: "Body",
        });

        dispatchEnter({ ctrlKey: true });

        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("plain Enter does not trigger confirm", () => {
        const onConfirm = vi.fn();
        renderDialog({
            title: "Test",
            titleId: "test-title",
            confirmAction: { label: "OK", onClick: onConfirm },
            children: "Body",
        });

        dispatchEnter();

        expect(onConfirm).not.toHaveBeenCalled();
    });

    it("Ctrl+Enter in a text field submits a form dialog with a submit confirm", () => {
        const onConfirm = vi.fn();
        renderDialog({
            as: "form",
            title: "Test",
            titleId: "test-title",
            confirmAction: { label: "Save", type: "submit", onClick: onConfirm },
            panelProps: {
                onSubmit: (event) => {
                    event.preventDefault();
                    onConfirm();
                },
            },
            children: (
                <input type="text" defaultValue="Example" aria-label="Title" />
            ),
        });

        const input = container.querySelector("input");
        expect(input).not.toBeNull();

        act(() => {
            input?.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Enter",
                    ctrlKey: true,
                    bubbles: true,
                }),
            );
        });

        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("plain Enter in a text field does not submit a form dialog", () => {
        const onConfirm = vi.fn();
        renderDialog({
            as: "form",
            title: "Test",
            titleId: "test-title",
            confirmAction: { label: "Save", type: "submit", onClick: onConfirm },
            panelProps: {
                onSubmit: (event) => {
                    event.preventDefault();
                    onConfirm();
                },
            },
            children: (
                <input type="text" defaultValue="Example" aria-label="Title" />
            ),
        });

        const input = container.querySelector("input");
        expect(input).not.toBeNull();

        act(() => {
            input?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
            );
        });

        expect(onConfirm).not.toHaveBeenCalled();
    });

    it("Ctrl+Enter triggers cancel when confirm is absent", () => {
        const onCancel = vi.fn();
        renderDialog({
            title: "Test",
            titleId: "test-title",
            cancelAction: { label: "Close", onClick: onCancel },
            children: "Body",
        });

        dispatchEnter({ ctrlKey: true });

        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});
