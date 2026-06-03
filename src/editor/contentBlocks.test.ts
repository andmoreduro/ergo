import { describe, expect, it } from "vitest";
import { createRichText } from "../state/ast/defaults";
import {
    finalizeContentBlocks,
    shouldDeferContentBlocksCommit,
} from "./contentBlocks";

describe("shouldDeferContentBlocksCommit", () => {
    it("defers when the only new content is a trailing empty paragraph", () => {
        const committed = [[createRichText("Hello")]];
        const next = [[createRichText("Hello")], []];

        expect(shouldDeferContentBlocksCommit(next, committed)).toBe(true);
        expect(finalizeContentBlocks(next)).toEqual(committed);
    });

    it("does not defer when a new paragraph has text", () => {
        const committed = [[createRichText("Hello")]];
        const next = [[createRichText("Hello")], [createRichText("World")]];

        expect(shouldDeferContentBlocksCommit(next, committed)).toBe(false);
    });
});
