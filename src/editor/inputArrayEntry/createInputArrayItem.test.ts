import { describe, expect, it } from "vitest";
import { createInputArrayItem } from "./createInputArrayItem";
import type { InputSchema } from "../../bindings/InputSchema";

describe("createInputArrayItem", () => {
    it("builds empty object entries from the input schema", () => {
        const schema: InputSchema = {
            type: "object",
            properties: [
                { id: "name", type: "string" },
                { id: "role", type: "string" },
            ],
        };

        expect(createInputArrayItem(schema, 0)).toEqual({
            name: "",
            role: "",
        });
    });
});
