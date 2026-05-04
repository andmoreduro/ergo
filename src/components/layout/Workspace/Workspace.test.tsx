import { render, screen } from "@testing-library/react";
import { Workspace } from "./Workspace";
import { DocumentProvider } from "../../../state/DocumentContext";
import { CommandDispatcherProvider } from "../../../commands/CommandDispatcherContext";

import "@testing-library/jest-dom";

describe("Workspace component", () => {
    it("renders the Sidebar, Editor, and Preview columns", () => {
        render(
            <DocumentProvider>
                <CommandDispatcherProvider dispatchCommand={() => undefined}>
                    <Workspace />
                </CommandDispatcherProvider>
            </DocumentProvider>,
        );

        // Check Sidebar content
        expect(screen.getByText("Document Structure")).toBeInTheDocument();
        expect(screen.getByText("References")).toBeInTheDocument();
        expect(screen.getByText("Assets")).toBeInTheDocument();

        // Check Editor content
        expect(screen.getByText("Form Editor")).toBeInTheDocument();

        // Check Preview content
        expect(screen.getByText("Live Preview")).toBeInTheDocument();
    });
});
