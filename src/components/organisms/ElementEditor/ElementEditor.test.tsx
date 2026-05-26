import type React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import type { DocumentElement } from "../../../bindings/DocumentElement";

vi.mock("../../../api/tauri", () => ({
    TauriApi: {
        getTemplateSpec: vi.fn().mockResolvedValue({
            template: { id: "versatile-apa", name: "Versatile APA", version: "0.1.0" },
            package: { name: "@preview/versatile-apa", version: "7.2.0" },
            variants: [],
            inputs: [],
            groups: [],
            sections: [],
            custom_elements: [],
        }),
    },
}));

import { DocumentProvider } from "../../../state/DocumentContext";
import { TemplateSpecProvider } from "../../../state/TemplateSpecContext";
import { EditorNavigationProvider } from "../../../editor/EditorNavigationContext";
import { useFieldNavigation } from "../../../editor/useFieldNavigation";
import { ElementEditor } from "./ElementEditor";

const EditorNavigationTestProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const navigation = useFieldNavigation(null, null);
    return (
        <EditorNavigationProvider value={navigation}>
            {children}
        </EditorNavigationProvider>
    );
};

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
                <EditorNavigationTestProvider>
                    <TemplateSpecProvider templateId="versatile-apa">
                        <ElementEditor element={table} />
                    </TemplateSpecProvider>
                </EditorNavigationTestProvider>
            </DocumentProvider>,
        );

        expect(screen.getByLabelText("Cell row 1 column 1")).toBeInTheDocument();
    });
});
