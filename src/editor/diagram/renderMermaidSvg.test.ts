import { describe, expect, it } from "vitest";
import { removeMermaidRenderLeftovers } from "./renderMermaidSvg";

describe("removeMermaidRenderLeftovers", () => {
    it("removes Mermaid's body-level temp elements for the render id and nothing else", () => {
        document.body.innerHTML = `
            <div id="root"><div id="dergo-keep">app content</div></div>
            <div id="dergo-1"><svg id="ergo-1"></svg></div>
            <iframe id="iergo-1"></iframe>
            <svg id="ergo-1-stray"></svg>
            <div id="dergo-2"></div>
        `;

        removeMermaidRenderLeftovers("ergo-1");

        expect(document.getElementById("dergo-1")).toBeNull();
        expect(document.getElementById("iergo-1")).toBeNull();
        expect(document.getElementById("ergo-1")).toBeNull();
        // Other renders' elements and the app's own nodes are untouched.
        expect(document.getElementById("dergo-2")).not.toBeNull();
        expect(document.getElementById("dergo-keep")).not.toBeNull();
        expect(document.getElementById("root")).not.toBeNull();
    });

    it("leaves a same-id node alone when it is nested inside the app", () => {
        document.body.innerHTML = `<div id="root"><svg id="ergo-3"></svg></div>`;

        removeMermaidRenderLeftovers("ergo-3");

        expect(document.getElementById("ergo-3")).not.toBeNull();
    });
});
