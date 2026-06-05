import { describe, expect, it } from "vitest";
import type { TemplateOptionSpec } from "../bindings/TemplateOptionSpec";
import {
    getTemplateOptionValue,
    setTemplateOptionValue,
    templateOptionOverrideKey,
} from "./templateOptions";
import type { ProjectSettings } from "../bindings/ProjectSettings";

const emptyProjectSettings = (): ProjectSettings => ({
    paper_size: null,
    language: "en",
    text_font: null,
    math_font: null,
    raw_font: null,
    font_size: 11,
    table_stroke_width: 0.5,
    template_overrides: [],
});

describe("templateOptions", () => {
    const booleanOption: TemplateOptionSpec = {
        id: "draft_mode",
        label: "Draft mode",
        description: null,
        kind: "boolean",
        default: false,
        choices: [],
    };

    const choiceOption: TemplateOptionSpec = {
        id: "layout",
        label: "Layout",
        description: null,
        kind: "choice",
        default: "single",
        choices: [
            { value: "single", label: "Single column" },
            { value: "double", label: "Double column" },
        ],
    };

    it("uses spec defaults when no override is stored", () => {
        const settings = emptyProjectSettings();
        expect(getTemplateOptionValue(settings, booleanOption)).toBe("false");
        expect(getTemplateOptionValue(settings, choiceOption)).toBe("single");
    });

    it("stores values under option.* override keys", () => {
        const settings = setTemplateOptionValue(
            emptyProjectSettings(),
            "layout",
            "double",
        );
        expect(templateOptionOverrideKey("layout")).toBe("option.layout");
        expect(getTemplateOptionValue(settings, choiceOption)).toBe("double");
    });
});
