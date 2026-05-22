import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import type { DocumentAST } from "../../../bindings/DocumentAST";
import { EditorFieldRegistryProvider } from "../../../state/EditorFieldRegistry";
import { DocumentProvider, useDocument } from "../../../state/DocumentContext";
import { createDefaultDocumentAST } from "../../../state/ast/defaults";
import { Editor } from "./Editor";

import "@testing-library/jest-dom";

const LoadDocument = ({ ast }: { ast: DocumentAST }) => {
    const { dispatch } = useDocument();

    useEffect(() => {
        dispatch({ type: "LOAD_DOCUMENT", payload: { ast } });
    }, [ast, dispatch]);

    return null;
};

const createDocumentWithTemplateCollections = () => {
    const ast = createDefaultDocumentAST();
    return {
        ...ast,
        inputs: {
            ...ast.inputs,
            affiliations: ["Universidad Norte"],
            authors: [
                {
                    name: "Ada Lovelace",
                    affiliations: ["1"],
                },
            ],
        },
    };
};

describe("Editor template input fields", () => {
    it("registers selected author affiliation references with their template input path", () => {
        render(
            <DocumentProvider>
                <EditorFieldRegistryProvider>
                    <LoadDocument ast={createDocumentWithTemplateCollections()} />
                    <Editor />
                </EditorFieldRegistryProvider>
            </DocumentProvider>,
        );

        expect(screen.getByRole("checkbox", {
            name: "Universidad Norte",
        })).toHaveAttribute(
            "data-editor-field-id",
            "project-input-/authors/0/affiliations/0",
        );
    });
});
