import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DocumentAST } from "../../../bindings/DocumentAST";
import { ActionRuntimeProvider } from "../../../actions/runtime";
import { EditorFieldRegistryProvider } from "../../../state/EditorFieldRegistry";
import { DocumentProvider, useDocument } from "../../../state/DocumentContext";
import { TemplateSpecProvider } from "../../../state/TemplateSpecContext";
import { createDefaultDocumentAST } from "../../../state/ast/defaults";
import { Editor } from "./Editor";

import "@testing-library/jest-dom";

const tauriApiMock = vi.hoisted(() => ({
    getTemplateSpec: vi.fn(),
}));

vi.mock("../../../api/tauri", () => ({
    TauriApi: tauriApiMock,
}));

tauriApiMock.getTemplateSpec.mockResolvedValue({
    template: { id: "versatile-apa", name: "APA 7th Edition", version: "1.0.0" },
    package: { name: "@preview/versatile-apa", version: "7.2.0" },
    variants: [],
    inputs: [
        { id: "title", type: "string", label: "Title", importance: "required" },
        {
            id: "authors",
            type: "array",
            label: "Authors",
            importance: "required",
            items: {
                type: "object",
                properties: [
                    { id: "name", type: "string", label: "Name", importance: "required" },
                    {
                        id: "affiliations",
                        type: "array",
                        label: "Affiliations",
                        importance: "optional",
                        items: { type: "reference", target: "affiliations" },
                    },
                ],
            },
        },
        {
            id: "affiliations",
            type: "array",
            label: "Affiliations",
            importance: "recommended",
            items: { type: "string", label: "Affiliation Name" },
        },
    ],
    groups: [
        { id: "cover_page", label: "Cover Page", inputs: ["title", "authors", "affiliations"] },
    ],
    sections: [
        { id: "title-page", kind: "function_call", function: "title-page", params: [] },
        { id: "body", kind: "content" },
    ],
    custom_elements: [],
});

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
    it("registers selected author affiliation references with their template input path", async () => {
        render(
            <DocumentProvider>
                <TemplateSpecProvider templateId="versatile-apa">
                    <EditorFieldRegistryProvider>
                        <LoadDocument ast={createDocumentWithTemplateCollections()} />
                        <Editor />
                    </EditorFieldRegistryProvider>
                </TemplateSpecProvider>
            </DocumentProvider>,
        );

        expect(await screen.findByRole("checkbox", {
            name: "Universidad Norte",
        })).toHaveAttribute(
            "data-editor-field-id",
            "project-input-/authors/0/affiliations/0",
        );
    });

    it("removes the focused APA author from the editor delete button", async () => {
        render(
            <ActionRuntimeProvider>
                <DocumentProvider>
                <TemplateSpecProvider templateId="versatile-apa">
                    <EditorFieldRegistryProvider>
                        <LoadDocument ast={createDocumentWithTemplateCollections()} />
                        <Editor />
                    </EditorFieldRegistryProvider>
                </TemplateSpecProvider>
                </DocumentProvider>
            </ActionRuntimeProvider>,
        );

        const authorInput = await screen.findByDisplayValue("Ada Lovelace");
        fireEvent.focus(authorInput);

        const deleteButton = screen.getByRole("button", { name: "Delete" });
        expect(deleteButton).toBeEnabled();
        fireEvent.click(deleteButton);

        await waitFor(() => {
            expect(
                screen.queryByDisplayValue("Ada Lovelace"),
            ).not.toBeInTheDocument();
        });
    });

    it("renders reference arrays from schema target metadata without template-specific paths", async () => {
        tauriApiMock.getTemplateSpec.mockResolvedValueOnce({
            template: { id: "generic", name: "Generic", version: "1.0.0" },
            package: { name: "@preview/generic", version: "1.0.0" },
            variants: [],
            inputs: [
                {
                    id: "institutions",
                    type: "array",
                    label: "Institutions",
                    importance: "recommended",
                    items: { type: "string", label: "Institution Name" },
                },
                {
                    id: "reviewers",
                    type: "array",
                    label: "Reviewers",
                    importance: "required",
                    items: {
                        type: "object",
                        properties: [
                            {
                                id: "name",
                                type: "string",
                                label: "Name",
                                importance: "required",
                            },
                            {
                                id: "institutions",
                                type: "array",
                                label: "Institutions",
                                importance: "optional",
                                items: {
                                    type: "reference",
                                    target: "institutions",
                                },
                            },
                        ],
                    },
                },
            ],
            groups: [
                {
                    id: "review",
                    label: "Review",
                    inputs: ["reviewers", "institutions"],
                },
            ],
            sections: [{ id: "body", kind: "content" }],
            custom_elements: [],
        });
        const ast = createDefaultDocumentAST();
        ast.inputs = {
            ...ast.inputs,
            institutions: ["Lab One"],
            reviewers: [
                {
                    name: "Grace Hopper",
                    institutions: ["1"],
                },
            ],
        };

        render(
            <DocumentProvider>
                <TemplateSpecProvider templateId="generic">
                    <EditorFieldRegistryProvider>
                        <LoadDocument ast={ast} />
                        <Editor />
                    </EditorFieldRegistryProvider>
                </TemplateSpecProvider>
            </DocumentProvider>,
        );

        expect(await screen.findByRole("checkbox", {
            name: "Lab One",
        })).toHaveAttribute(
            "data-editor-field-id",
            "project-input-/reviewers/0/institutions/0",
        );
    });
});
