import { describe, expect, it } from "vitest";
import { getTemplateManifest, listTemplateManifests } from "./registry";

describe("template registry", () => {
    it("loads the bundled APA7 manifest", () => {
        const template = getTemplateManifest("apa7");

        expect(template.packageName).toBe("@preview/versatile-apa");
        expect(template.packageVersion).toBe("7.2.0");
        expect(template.fields.map((field) => field.id)).toContain("abstract");
    });

    it("falls back to APA7 for unknown templates", () => {
        expect(getTemplateManifest("unknown").id).toBe("apa7");
        expect(listTemplateManifests()).toHaveLength(1);
    });
});
