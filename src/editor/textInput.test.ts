import { describe, expect, it } from "vitest";
import { collapseConsecutiveSpaces } from "./textInput";

describe("textInput", () => {
    it("collapses consecutive spaces while keeping single edge spaces", () => {
        expect(collapseConsecutiveSpaces("hello  world")).toBe("hello world");
        expect(collapseConsecutiveSpaces("a   b")).toBe("a b");
        expect(collapseConsecutiveSpaces("single space")).toBe("single space");
        expect(collapseConsecutiveSpaces("hello ")).toBe("hello ");
        expect(collapseConsecutiveSpaces("  hello")).toBe(" hello");
    });
});
