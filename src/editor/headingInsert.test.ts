import { describe, expect, it } from "vitest";
import { parseHeadingInsertLevel } from "./headingInsert";

describe("parseHeadingInsertLevel", () => {
    it("reads level from action payload", () => {
        expect(parseHeadingInsertLevel({ level: 3 })).toBe(3);
    });

    it("coerces string and bigint levels from IPC payloads", () => {
        expect(parseHeadingInsertLevel({ level: "5" })).toBe(5);
        expect(parseHeadingInsertLevel({ level: 2n })).toBe(2);
    });

    it("rejects invalid levels", () => {
        expect(parseHeadingInsertLevel({ level: 0 })).toBeNull();
        expect(parseHeadingInsertLevel({ level: 7 })).toBeNull();
        expect(parseHeadingInsertLevel(null)).toBeNull();
    });
});
