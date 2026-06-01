import { describe, expect, it } from "vitest";
import type { DocumentElement } from "../../bindings/DocumentElement";
import { createRichText, createTable } from "../../state/ast/defaults";
import {
    applyElementEvents,
    diffChangedBlocks,
    diffSectionElements,
    rangeSignificantlyEqual,
} from "./sectionDiff";

const SECTION = "sec-1";

const paragraph = (id: string, text: string): DocumentElement => ({
    type: "Paragraph",
    id,
    content: text ? [createRichText(text)] : [],
});

const heading = (id: string, level: number, text: string): DocumentElement => ({
    type: "Heading",
    id,
    level,
    content: text ? [createRichText(text)] : [],
});

const quote = (id: string, text: string): DocumentElement => ({
    type: "Quote",
    id,
    content: text ? [createRichText(text)] : [],
});

/** Every delta must reproduce the target forward and restore the source back. */
const expectRoundTrip = (prev: DocumentElement[], next: DocumentElement[]) => {
    const delta = diffSectionElements(SECTION, prev, next);
    expect(applyElementEvents(prev, delta.forward)).toEqual(next);
    expect(applyElementEvents(next, delta.inverse)).toEqual(prev);
    return delta;
};

describe("diffSectionElements", () => {
    it("emits nothing when unchanged", () => {
        const prev = [paragraph("p1", "hello")];
        const delta = diffSectionElements(SECTION, prev, [paragraph("p1", "hello")]);
        expect(delta.forward).toEqual([]);
        expect(delta.inverse).toEqual([]);
    });

    it("maps an in-place text edit to a single updateParagraphContent", () => {
        const delta = expectRoundTrip(
            [paragraph("p1", "hello")],
            [paragraph("p1", "hello world")],
        );
        expect(delta.forward).toHaveLength(1);
        expect(delta.forward[0].type).toBe("updateParagraphContent");
    });

    it("maps an Enter-split to update + one insert (new element keeps its id)", () => {
        const delta = expectRoundTrip(
            [paragraph("p1", "helloworld")],
            [paragraph("p1", "hello"), paragraph("p2", "world")],
        );
        expect(delta.forward.map((e) => e.type)).toEqual([
            "updateParagraphContent",
            "insertElement",
        ]);
    });

    it("maps a Backspace-merge to remove + survivor update", () => {
        const delta = expectRoundTrip(
            [paragraph("p1", "a"), paragraph("p2", "b")],
            [paragraph("p1", "ab")],
        );
        expect(delta.forward.map((e) => e.type)).toEqual([
            "removeElement",
            "updateParagraphContent",
        ]);
    });

    it("maps a paragraph→heading type change to replace-in-place (same id)", () => {
        const delta = expectRoundTrip(
            [paragraph("p1", "Title")],
            [heading("p1", 2, "Title")],
        );
        expect(delta.forward.map((e) => e.type)).toEqual([
            "removeElement",
            "insertElement",
        ]);
    });

    it("maps a heading level change to updateHeadingContent", () => {
        const delta = expectRoundTrip(
            [heading("h1", 1, "Title")],
            [heading("h1", 3, "Title")],
        );
        expect(delta.forward).toHaveLength(1);
        expect(delta.forward[0]).toMatchObject({
            type: "updateHeadingContent",
            level: 3,
        });
    });

    it("replaces a changed quote (no dedicated content event) keeping its id", () => {
        expectRoundTrip([quote("q1", "before")], [quote("q1", "after")]);
    });

    it("handles multi-block insert and remove together", () => {
        expectRoundTrip(
            [paragraph("a", "A"), paragraph("b", "B"), paragraph("c", "C")],
            [paragraph("a", "A"), paragraph("c", "C"), paragraph("d", "D")],
        );
    });

    it("falls back to a verified full replace for a pure reorder", () => {
        const prev = [paragraph("a", "A"), paragraph("b", "B")];
        const next = [paragraph("b", "B"), paragraph("a", "A")];
        const delta = expectRoundTrip(prev, next);
        // granular diff can't see a reorder, so the fallback removes then re-inserts
        expect(delta.forward.filter((e) => e.type === "insertElement")).toHaveLength(2);
    });

    it("handles inserting at the front and end at once", () => {
        expectRoundTrip(
            [paragraph("mid", "M")],
            [paragraph("head", "H"), paragraph("mid", "M"), paragraph("tail", "T")],
        );
    });

    it("maps a list item text edit via replace-in-place", () => {
        const list = (id: string, items: string[]): DocumentElement => ({
            type: "List",
            id,
            items: items.map((text) => (text ? [createRichText(text)] : [])),
        });
        expectRoundTrip([list("l1", ["one", "two"])], [list("l1", ["one", "TWO"])]);
    });

    it("round-trips replacing a table with a paragraph", () => {
        const table = createTable(2, 2, "t1");
        expectRoundTrip([table], [paragraph("t1", "x")]);
    });

    it("maps a single table cell edit to updateTableCell", () => {
        const prev = [createTable(2, 2, "t1")];
        const nextTable = createTable(2, 2, "t1");
        if (nextTable.type === "Table") {
            nextTable.cells[0][0] = {
                ...nextTable.cells[0][0],
                content: [createRichText("changed")],
            };
        }
        const delta = expectRoundTrip(prev, [nextTable]);
        expect(delta.forward).toHaveLength(1);
        expect(delta.forward[0].type).toBe("updateTableCell");
    });
});

describe("diffChangedBlocks (scoped hot path)", () => {
    /** A scoped delta must reproduce the target and restore the source. */
    const expectScopedRoundTrip = (
        prev: DocumentElement[],
        next: DocumentElement[],
        from: number,
        to: number,
    ) => {
        const delta = diffChangedBlocks(SECTION, prev, next, from, to);
        expect(delta).not.toBeNull();
        expect(applyElementEvents(prev, delta!.forward)).toEqual(next);
        expect(applyElementEvents(next, delta!.inverse)).toEqual(prev);
        return delta!;
    };

    it("only emits events for the changed block in the range", () => {
        const prev = [
            paragraph("a", "A"),
            paragraph("b", "B"),
            paragraph("c", "C"),
        ];
        const next = [paragraph("a", "A"), paragraph("b", "B!"), paragraph("c", "C")];
        const delta = expectScopedRoundTrip(prev, next, 1, 1);
        expect(delta.forward).toHaveLength(1);
        expect(delta.forward[0]).toMatchObject({
            type: "updateParagraphContent",
            element_id: "b",
        });
    });

    it("matches the full diff for an in-place edit", () => {
        const prev = [paragraph("a", "A"), paragraph("b", "B")];
        const next = [paragraph("a", "A"), paragraph("b", "B B")];
        const scoped = diffChangedBlocks(SECTION, prev, next, 1, 1);
        const full = diffSectionElements(SECTION, prev, next);
        expect(scoped).toEqual(full);
    });

    it("handles an in-place type change within the range (keeps id)", () => {
        const prev = [paragraph("a", "A"), paragraph("b", "Title")];
        const next = [paragraph("a", "A"), heading("b", 2, "Title")];
        const delta = expectScopedRoundTrip(prev, next, 1, 1);
        expect(delta.forward.map((e) => e.type)).toEqual([
            "removeElement",
            "insertElement",
        ]);
    });

    it("returns null when block identity shifts (caller falls back)", () => {
        const prev = [paragraph("a", "A"), paragraph("b", "B")];
        const next = [paragraph("a", "A"), paragraph("c", "C")];
        expect(diffChangedBlocks(SECTION, prev, next, 1, 1)).toBeNull();
    });

    it("returns null when lengths differ (structural change)", () => {
        const prev = [paragraph("a", "A")];
        const next = [paragraph("a", "A"), paragraph("b", "B")];
        expect(diffChangedBlocks(SECTION, prev, next, 0, 0)).toBeNull();
    });
});

describe("rangeSignificantlyEqual", () => {
    it("ignores blocks outside the range", () => {
        const prev = [paragraph("a", "A"), paragraph("b", "B")];
        const next = [paragraph("a", "CHANGED"), paragraph("b", "B")];
        // Only block 1 is in range and it is unchanged → equal.
        expect(rangeSignificantlyEqual(prev, next, 1, 1)).toBe(true);
    });

    it("detects a significant change inside the range", () => {
        const prev = [paragraph("a", "A"), paragraph("b", "B")];
        const next = [paragraph("a", "A"), paragraph("b", "different")];
        expect(rangeSignificantlyEqual(prev, next, 1, 1)).toBe(false);
    });

    it("treats trailing-whitespace-only edits as insignificant", () => {
        const prev = [paragraph("a", "hello")];
        const next = [paragraph("a", "hello ")];
        expect(rangeSignificantlyEqual(prev, next, 0, 0)).toBe(true);
    });
});
