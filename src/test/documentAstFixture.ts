import type { DocumentAST } from "../bindings/DocumentAST";
import { createDocumentAST } from "../state/ast/defaults";

/** Minimal AST for unit tests — no bundled template id, variant, or Typst packages. */
export const createTestDocumentAST = (): DocumentAST => {
    const ast = createDocumentAST("none");
    ast.inputs = {
        title: "Untitled Document",
        notes: "",
        authors: [{ name: "", affiliations: [] }],
    };
    return ast;
};
