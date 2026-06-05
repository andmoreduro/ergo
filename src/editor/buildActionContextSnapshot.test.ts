import { describe, expect, it } from "vitest";
import type { ActionContextSnapshot } from "../bindings/ActionContextSnapshot";
import { buildActionContextSnapshot } from "./buildActionContextSnapshot";

describe("buildActionContextSnapshot", () => {
    it("treats data-ergo-body-editor targets as body editor without active view", () => {
        const mount = document.createElement("div");
        mount.setAttribute("data-ergo-body-editor", "");
        const inner = document.createElement("p");
        inner.textContent = "x";
        mount.appendChild(inner);
        document.body.appendChild(mount);

        const getSnapshot = (): ActionContextSnapshot => ({
            window_id: "main",
            focused_context_id: "body-section",
            nodes: [
                {
                    id: "body-section",
                    parent_id: "editor",
                    contexts: ["body", "editor"],
                    attributes: {},
                },
            ],
        });

        const snapshot = buildActionContextSnapshot(inner, getSnapshot);
        expect(snapshot.focused_context_id).toBe("body-section");
        expect(snapshot.nodes.some((node) => node.id === "active-input")).toBe(
            false,
        );

        mount.remove();
    });

    it("adds inlineElement context for inline quote hosts", () => {
        const host = document.createElement("span");
        host.setAttribute("data-inline-quote-host", "");
        const input = document.createElement("input");
        host.appendChild(input);
        document.body.appendChild(host);

        const getSnapshot = (): ActionContextSnapshot => ({
            window_id: "main",
            focused_context_id: "body-section",
            nodes: [
                {
                    id: "body-section",
                    parent_id: "editor",
                    contexts: ["body", "editor"],
                    attributes: {},
                },
            ],
        });

        const snapshot = buildActionContextSnapshot(input, getSnapshot);
        expect(snapshot.focused_context_id).toBe("active-inline-element");
        expect(
            snapshot.nodes.find((node) => node.id === "active-inline-element")
                ?.contexts,
        ).toEqual(["inlineElement"]);

        host.remove();
    });
});
