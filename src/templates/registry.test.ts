import { describe, expect, it } from "vitest";
import { getTemplateSpec, listTemplateSpecs } from "./registry";

describe("template registry", () => {
    it("loads the bundled versatile-apa spec", () => {
        const spec = getTemplateSpec("versatile-apa");

        expect(spec.package.name).toBe("@preview/versatile-apa");
        expect(spec.package.version).toBe("7.2.0");
        expect(spec.sections.map((section) => section.id)).toContain("abstract-page");
    });

    it("falls back to versatile-apa for unknown templates", () => {
        expect(getTemplateSpec("unknown").template.id).toBe("versatile-apa");
        expect(listTemplateSpecs()).toHaveLength(1);
    });
});
