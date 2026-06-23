import { describe, expect, it } from "vitest";
import {
    parseRemoveTableColumnPayload,
    parseRemoveTableRowPayload,
} from "./tableActionPayloads";

describe("parseRemoveTableRowPayload", () => {
    it("reads a numeric rowIndex", () => {
        expect(parseRemoveTableRowPayload({ rowIndex: 2 })).toBe(2);
    });

    it("returns null when rowIndex is absent", () => {
        expect(parseRemoveTableRowPayload({})).toBeNull();
        expect(parseRemoveTableRowPayload(null)).toBeNull();
    });

    it("returns null when rowIndex is not a number", () => {
        expect(parseRemoveTableRowPayload({ rowIndex: "2" })).toBeNull();
        expect(parseRemoveTableRowPayload({ rowIndex: undefined })).toBeNull();
    });
});

describe("parseRemoveTableColumnPayload", () => {
    it("reads a numeric colIndex", () => {
        expect(parseRemoveTableColumnPayload({ colIndex: 1 })).toBe(1);
    });

    it("returns null when colIndex is absent or invalid", () => {
        expect(parseRemoveTableColumnPayload({})).toBeNull();
        expect(parseRemoveTableColumnPayload(null)).toBeNull();
        expect(parseRemoveTableColumnPayload({ colIndex: true })).toBeNull();
    });
});
