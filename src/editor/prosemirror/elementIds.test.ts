import { describe, expect, it } from "vitest";
import type { DocumentElement } from "../../bindings/DocumentElement";
import { regenerateElementIds } from "./elementIds";

const figure: DocumentElement = {
    type: "Figure",
    id: "fig1",
    asset_id: "asset-1",
    content: { type: "Paragraph", id: "p-inner", content: [] },
    caption: "cap",
    placement: "here",
    extra_fields: {},
};

describe("regenerateElementIds", () => {
    it("assigns a fresh top-level id but keeps the asset id", () => {
        const next = regenerateElementIds(figure);
        expect(next.id).not.toBe("fig1");
        expect(next.type === "Figure" && next.asset_id).toBe("asset-1");
    });

    it("regenerates nested element ids", () => {
        const next = regenerateElementIds(figure);
        expect(next.type === "Figure" && next.content.id).not.toBe("p-inner");
    });

    it("uses the provided top-level id when given", () => {
        expect(regenerateElementIds(figure, "fixed").id).toBe("fixed");
    });

    it("refreshes every cell element id of a table", () => {
        const table: DocumentElement = {
            type: "Table",
            id: "t1",
            rows: 1,
            cols: 1,
            cells: [
                [
                    {
                        elements: [
                            { type: "Paragraph", id: "cell-p", content: [] },
                        ],
                        row_span: null,
                        col_span: null,
                    },
                ],
            ],
            column_sizes: ["auto"],
            extra_fields: {},
        };
        const next = regenerateElementIds(table);
        expect(next.id).not.toBe("t1");
        expect(
            next.type === "Table" && next.cells[0][0].elements[0].id,
        ).not.toBe("cell-p");
    });
});
