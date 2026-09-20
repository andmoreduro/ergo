import { describe, expect, it } from "vitest";
import { createInputArrayItem } from "./createInputArrayItem";
import type { InputSchema } from "../../bindings/InputSchema";

const property = (
    id: string,
    type: InputSchema["type"],
    default_value: unknown = null,
): InputSchema => ({
    id,
    type,
    label: null,
    description: null,
    default: default_value,
    importance: "optional",
    variants: null,
    properties: null,
    items: null,
    target: null,
});

describe("createInputArrayItem", () => {
    it("seeds each object property per its type", () => {
        const schema: InputSchema = {
            ...property("root", "object"),
            properties: [
                property("name", "string"),
                property("id", "integer"),
                property("affiliations", "array"),
                property("symbol", "equation"),
                property("role", "string", "Author"),
            ],
        };

        expect(createInputArrayItem(schema, 2)).toEqual({
            name: "",
            id: 3,
            affiliations: [],
            symbol: { syntax: "typst", source: "" },
            role: "Author",
        });
    });

    it("falls back to the schema default for non-object item schemas", () => {
        expect(createInputArrayItem(property("note", "string", "seed"), 0)).toBe(
            "seed",
        );
        expect(createInputArrayItem(property("note", "string"), 0)).toBe("");
        expect(createInputArrayItem(null, 0)).toBe("");
    });
});
