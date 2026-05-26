import { describe, expect, it } from "vitest";
import {
    collapseConsecutiveSpaces,
    normalizeEditableText,
} from "./textInput";

describe("textInput", () => {
    it("collapses consecutive spaces", () => {
        expect(collapseConsecutiveSpaces("hello  world")).toBe("hello world");
        expect(collapseConsecutiveSpaces("a   b")).toBe("a b");
        expect(collapseConsecutiveSpaces("single space")).toBe("single space");
    });

    it("preserves single leading and trailing spaces", () => {
        expect(normalizeEditableText("hello ")).toBe("hello ");
        expect(normalizeEditableText("  hello")).toBe(" hello");
    });
});
