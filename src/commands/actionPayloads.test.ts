import { describe, expect, it } from "vitest";
import { numericPayloadField } from "./actionPayloads";

describe("numericPayloadField", () => {
    it("reads a numeric field from a payload object", () => {
        expect(numericPayloadField({ rowIndex: 2 }, "rowIndex")).toBe(2);
        expect(numericPayloadField({ index: 0 }, "index")).toBe(0);
    });

    it("returns null for absent, mistyped, or non-object payloads", () => {
        expect(numericPayloadField({}, "rowIndex")).toBeNull();
        expect(numericPayloadField({ rowIndex: "2" }, "rowIndex")).toBeNull();
        expect(numericPayloadField({ rowIndex: null }, "rowIndex")).toBeNull();
        expect(numericPayloadField(null, "rowIndex")).toBeNull();
        expect(numericPayloadField("rowIndex", "rowIndex")).toBeNull();
        expect(numericPayloadField(undefined, "rowIndex")).toBeNull();
    });
});
