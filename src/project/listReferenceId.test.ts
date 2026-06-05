import { describe, expect, it } from "vitest";
import { listReferenceId } from "./listReferenceId";

describe("listReferenceId", () => {
    it("uses numeric ids by default", () => {
        expect(listReferenceId(0)).toBe("1");
        expect(listReferenceId(1)).toBe("2");
    });

    it("uses lowercase letters for lowercase-alpha style", () => {
        expect(listReferenceId(0, "lowercase-alpha")).toBe("a");
        expect(listReferenceId(1, "lowercase-alpha")).toBe("b");
    });
});
