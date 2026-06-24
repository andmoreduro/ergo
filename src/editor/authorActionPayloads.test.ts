import { describe, expect, it } from "vitest";
import { parseRemoveAuthorPayload } from "./authorActionPayloads";

describe("parseRemoveAuthorPayload", () => {
    it("reads a numeric index", () => {
        expect(parseRemoveAuthorPayload({ index: 1 })).toBe(1);
    });

    it("returns null when index is absent or invalid", () => {
        expect(parseRemoveAuthorPayload({})).toBeNull();
        expect(parseRemoveAuthorPayload(null)).toBeNull();
        expect(parseRemoveAuthorPayload({ index: "1" })).toBeNull();
    });
});
