import { describe, expect, it } from "vitest";
import { DOMParser as PMDOMParser, DOMSerializer } from "prosemirror-model";
import type { DocumentElement } from "../../bindings/DocumentElement";
import { bodySchema } from "./schema";

/** Serialize a single block node to DOM and parse it back (the clipboard path). */
const roundTrip = (node: import("prosemirror-model").Node) => {
    const container = document.createElement("div");
    container.appendChild(DOMSerializer.fromSchema(bodySchema).serializeNode(node));
    return PMDOMParser.fromSchema(bodySchema).parse(container).firstChild;
};

describe("atom block clipboard round-trip", () => {
    it("preserves an equation's element payload (not just its kind label)", () => {
        const equation: DocumentElement = {
            type: "Equation",
            id: "eq1",
            latex_source: "x^2",
            is_block: true,
            syntax: "latex",
        };
        const node = bodySchema.nodes.equation.create({
            element: equation,
            elementId: "eq1",
        });

        const parsed = roundTrip(node);

        expect(parsed?.type.name).toBe("equation");
        expect(parsed?.attrs.element).toEqual(equation);
        expect(parsed?.attrs.elementId).toBe("eq1");
    });

    it("preserves a figure's nested content through the clipboard", () => {
        const figure: DocumentElement = {
            type: "Figure",
            id: "fig1",
            asset_id: null,
            content: {
                type: "Paragraph",
                id: "p-inner",
                content: [],
            },
            caption: "A caption",
            placement: "here",
            extra_fields: {},
        };
        const node = bodySchema.nodes.figure.create({
            element: figure,
            elementId: "fig1",
        });

        const parsed = roundTrip(node);

        expect(parsed?.type.name).toBe("figure");
        expect(parsed?.attrs.element).toEqual(figure);
    });
});
