import { describe, expect, it } from "vitest";
import {
    isTableCellForbiddenInsert,
    TABLE_CELL_FORBIDDEN_INSERTS,
} from "./tableCellInsertPolicy";

describe("tableCellInsertPolicy", () => {
    it("forbids section-level block inserts inside cells", () => {
        expect(TABLE_CELL_FORBIDDEN_INSERTS.has("heading")).toBe(true);
        expect(TABLE_CELL_FORBIDDEN_INSERTS.has("table")).toBe(true);
        expect(TABLE_CELL_FORBIDDEN_INSERTS.has("figure")).toBe(true);
        expect(TABLE_CELL_FORBIDDEN_INSERTS.has("diagram")).toBe(true);
    });

    it("allows in-cell block types", () => {
        expect(isTableCellForbiddenInsert("paragraph")).toBe(false);
        expect(isTableCellForbiddenInsert("quote")).toBe(false);
        expect(isTableCellForbiddenInsert("list")).toBe(false);
        expect(isTableCellForbiddenInsert("enumeration")).toBe(false);
        expect(isTableCellForbiddenInsert("equation")).toBe(false);
        expect(isTableCellForbiddenInsert("inlineEquation")).toBe(false);
    });
});
