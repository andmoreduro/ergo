import { describe, expect, it } from "vitest";
import { createDocumentAST } from "./defaults";

describe("createDocumentAST defaults", () => {
    it("creating an umb-apa document sets template_variant_id to null and initializes inputs", () => {
        const ast = createDocumentAST("umb-apa");
        expect(ast.metadata.template_id).toBe("umb-apa");
        expect(ast.metadata.template_variant_id).toBeNull();
        expect(ast.dependencies.packages).toEqual([]);

        expect(ast.inputs.running_head).toBeUndefined();

        // Initializes new first-page inputs
        expect(ast.inputs.director).toEqual({ name: "", title: "" });
        expect(ast.inputs.degrees).toEqual([]);
        expect(ast.inputs.affiliations).toEqual([]);
        expect(ast.inputs.city).toBe("");
        expect(ast.inputs.country).toBe("");
        expect(ast.inputs.authors).toEqual([
            { name: "", affiliations: [], degrees: [] },
        ]);
        expect(typeof ast.inputs.year).toBe("string");
        expect(ast.inputs.year).toMatch(/^\d{4}$/); // current year, e.g. 2026
        expect(ast.inputs.authorities).toEqual([{ name: "", role: "" }]);
        expect(ast.inputs.acknowledgements).toBe("");
        expect(ast.inputs.abstract_es).toBe("");
        expect(ast.inputs.keywords_es).toEqual([]);
        expect(ast.inputs.abstract_en).toBe("");
        expect(ast.inputs.keywords_en).toEqual([]);
    });

    it("creating an apa7 document is unchanged", () => {
        const ast = createDocumentAST("apa7");
        expect(ast.metadata.template_id).toBe("apa7");
        expect(ast.metadata.template_variant_id).toBe("student");
        expect(ast.dependencies.packages).toEqual([
            {
                name: "@preview/versatile-apa",
                version: "7.2.0",
            },
        ]);
        
        // Assert old keys exist
        expect(ast.inputs.course).toBe("");
        expect(ast.inputs.due_date).toBe("");
        expect(ast.inputs.instructor).toBe("");

        // Assert new keys are not present
        expect(ast.inputs.director).toBeUndefined();
        expect(ast.inputs.degrees).toBeUndefined();
        expect(ast.inputs.country).toBeUndefined();
        expect(ast.inputs.city).toBeUndefined();
    });
});
