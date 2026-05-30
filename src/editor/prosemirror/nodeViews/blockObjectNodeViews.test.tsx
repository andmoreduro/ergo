import { describe, it, expect } from "vitest";
import { isValidElement } from "react";
import { bodySchema } from "../schema";
import { createBlockObjectNodeViews } from "./blockObjectNodeViews";
import { BlockObjectNodeViewHost } from "./BlockObjectNodeViewHost";
import { NodeViewPortalRegistry } from "./nodeViewPortals";

const equationNode = (id: string) =>
    bodySchema.nodes.equation.create({
        elementId: id,
        element: {
            type: "Equation",
            id,
            latex_source: "x^2",
            syntax: "latex",
            is_block: true,
        },
    });

describe("block-object node views use the portal registry", () => {
    it("registers a portal entry rendering the host inside the React tree", () => {
        const registry = new NodeViewPortalRegistry();
        const factories = createBlockObjectNodeViews(registry);

        const node = equationNode("eq1");
        // @ts-expect-error test stubs the view/getPos args the factory ignores
        const view = factories.equation(node, null, () => 0);

        const entries = registry.getSnapshot();
        expect(entries).toHaveLength(1);
        expect(entries[0].dom).toBe(view.dom);

        // The portal content is a real React element for the host component, so it
        // mounts inside the host provider tree (no detached `createRoot`).
        const content = entries[0].render();
        expect(isValidElement(content)).toBe(true);
        expect(content.type).toBe(BlockObjectNodeViewHost);
        expect(content.props).toMatchObject({ elementId: "eq1" });
    });

    it("updates the render thunk on node update and clears it on destroy", () => {
        const registry = new NodeViewPortalRegistry();
        const factories = createBlockObjectNodeViews(registry);
        // @ts-expect-error test stubs the view/getPos args the factory ignores
        const view = factories.figure(
            bodySchema.nodes.figure.create({ elementId: "fig1" }),
            null,
            () => 0,
        );

        view.update?.(bodySchema.nodes.figure.create({ elementId: "fig2" }));
        const content = registry.getSnapshot()[0].render();
        expect(content.props).toMatchObject({ elementId: "fig2" });

        view.destroy?.();
        expect(registry.getSnapshot()).toHaveLength(0);
    });

    it("keeps a stable snapshot reference between mutations", () => {
        const registry = new NodeViewPortalRegistry();
        const first = registry.getSnapshot();
        expect(registry.getSnapshot()).toBe(first);

        registry.register({
            key: "k",
            dom: document.createElement("div"),
            render: () => null,
        });
        const afterRegister = registry.getSnapshot();
        expect(afterRegister).not.toBe(first);
        expect(registry.getSnapshot()).toBe(afterRegister);
    });
});
