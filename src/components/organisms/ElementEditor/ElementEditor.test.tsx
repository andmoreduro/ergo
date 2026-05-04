import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import { DocumentProvider } from "../../../state/DocumentContext";
import { ElementEditor } from "./ElementEditor";

describe("ElementEditor", () => {
    it("uses localized accessible labels for table cells", () => {
        const table: DocumentElement = {
            type: "Table",
            id: "table-1",
            rows: 1,
            cols: 1,
            cells: [[{ content: "" }]],
            column_sizes: ["1fr"],
        };

        render(
            <DocumentProvider>
                <ElementEditor element={table} />
            </DocumentProvider>,
        );

        expect(screen.getByLabelText("Cell row 1 column 1")).toBeInTheDocument();
    });
});
