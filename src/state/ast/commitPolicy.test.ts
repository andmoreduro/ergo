import { describe, expect, it } from "vitest";
import type { DocumentAST } from "../../bindings/DocumentAST";
import {
    createDefaultDocumentAST,
    createEquation,
    createFigure,
    createParagraph,
    createRichText,
} from "./defaults";
import { shouldCommitAstAction, textSignificantlyEqual } from "./commitPolicy";
import type { ASTAction } from "./actions";
import { astReducer } from "./reducer";

describe("commitPolicy", () => {
    it("ignores leading and trailing whitespace when comparing text", () => {
        expect(textSignificantlyEqual("hello", "hello ")).toBe(true);
        expect(textSignificantlyEqual("  hello", "hello")).toBe(true);
        expect(textSignificantlyEqual("a b", "ab")).toBe(false);
        expect(textSignificantlyEqual("a", "b")).toBe(false);
    });

    it("treats consecutive spaces as equivalent to a single space", () => {
        expect(textSignificantlyEqual("hello world", "hello  world")).toBe(true);
    });

    it("skips equation updates that only add trailing whitespace", () => {
        const ast = astWithEquation("E=mc^2");
        const action: ASTAction = {
            type: "UPDATE_EQUATION",
            payload: {
                equationId: "equation-1",
                latexSource: "E=mc^2 ",
            },
        };
        const nextAst = applyAction(ast, action);
        expect(shouldCommitAstAction(ast, action, nextAst)).toBe(false);
    });

    it("commits an equation syntax change (typst -> latex)", () => {
        const ast = astWithEquation("E=mc^2");
        const action: ASTAction = {
            type: "UPDATE_EQUATION",
            payload: { equationId: "equation-1", syntax: "latex" },
        };
        const nextAst = applyAction(ast, action);
        expect(shouldCommitAstAction(ast, action, nextAst)).toBe(true);
    });

    it("skips an equation syntax change to the same syntax", () => {
        const ast = astWithEquation("E=mc^2");
        const action: ASTAction = {
            type: "UPDATE_EQUATION",
            payload: { equationId: "equation-1", syntax: "typst" },
        };
        const nextAst = applyAction(ast, action);
        expect(shouldCommitAstAction(ast, action, nextAst)).toBe(false);
    });

    it("skips project input updates that only add trailing whitespace", () => {
        const ast = createDefaultDocumentAST();
        ast.inputs = { title: "Hello" };
        const action: ASTAction = {
            type: "UPDATE_INPUT",
            payload: { path: "/title", value: "Hello " },
        };
        const nextAst = applyAction(ast, action);
        expect(shouldCommitAstAction(ast, action, nextAst)).toBe(false);
    });

    it("skips paragraph updates that only add whitespace", () => {
        const ast = astWithParagraph("hello");
        const action: ASTAction = {
            type: "UPDATE_PARAGRAPH_CONTENT",
            payload: {
                paragraphId: "paragraph-1",
                content: [createRichText("hello ")],
            },
        };
        const nextAst = applyAction(ast, action);
        expect(shouldCommitAstAction(ast, action, nextAst)).toBe(false);
    });

    it("blocks figure caption edits until an image is linked", () => {
        const ast = astWithFigure(null);
        const action: ASTAction = {
            type: "UPDATE_FIGURE",
            payload: {
                figureId: "figure-1",
                caption: "Caption",
            },
        };
        const nextAst = applyAction(ast, action);
        expect(shouldCommitAstAction(ast, action, nextAst)).toBe(false);
    });

    it("keeps unrelated project input edits live while a figure is missing its image", () => {
        const ast = astWithFigure(null);
        ast.inputs = { title: "Draft" };
        const action: ASTAction = {
            type: "UPDATE_INPUT",
            payload: { path: "/title", value: "Live Draft" },
        };

        const nextAst = applyAction(ast, action);

        expect(shouldCommitAstAction(ast, action, nextAst)).toBe(true);
    });

    it("blocks figure body and extra-field edits until an image is linked", () => {
        const ast = astWithFigure(null);
        const bodyAction: ASTAction = {
            type: "UPDATE_FIGURE",
            payload: {
                figureId: "figure-1",
                bodyText: "Body",
            },
        };
        const extraFieldAction: ASTAction = {
            type: "UPDATE_ELEMENT_EXTRA_FIELD",
            payload: {
                elementId: "figure-1",
                fieldKey: "width",
                fieldValue: "80%",
            },
        };

        expect(
            shouldCommitAstAction(ast, bodyAction, applyAction(ast, bodyAction)),
        ).toBe(false);
        expect(
            shouldCommitAstAction(
                ast,
                extraFieldAction,
                applyAction(ast, extraFieldAction),
            ),
        ).toBe(false);
    });

    it("allows figure caption edits after an image is linked", () => {
        const ast = astWithFigure("asset-1");
        const action: ASTAction = {
            type: "UPDATE_FIGURE",
            payload: {
                figureId: "figure-1",
                caption: "Caption",
            },
        };
        const nextAst = applyAction(ast, action);
        expect(shouldCommitAstAction(ast, action, nextAst)).toBe(true);
    });
});

const astWithParagraph = (text: string): DocumentAST => {
    const ast = createDefaultDocumentAST();
    const section = ast.sections[0];
    if (section.type === "Content") {
        section.elements = [createParagraph(text, "paragraph-1")];
    }
    return ast;
};

const astWithEquation = (latex: string): DocumentAST => {
    const ast = createDefaultDocumentAST();
    const section = ast.sections[0];
    if (section.type === "Content") {
        section.elements = [createEquation("equation-1", latex)];
    }
    return ast;
};

const astWithFigure = (assetId: string | null): DocumentAST => {
    const ast = createDefaultDocumentAST();
    const section = ast.sections[0];
    if (section.type === "Content") {
        const figure = createFigure("figure-1");
        if (figure.type === "Figure") {
            figure.asset_id = assetId;
        }
        section.elements = [figure];
    }
    return ast;
};

const applyAction = (ast: DocumentAST, action: ASTAction): DocumentAST =>
    astReducer(ast, action);
