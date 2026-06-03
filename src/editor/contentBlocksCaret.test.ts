import { describe, expect, it } from "vitest";
import { createRichText } from "../state/ast/defaults";
import {
    globalCaretInContentBlocks,
    localCaretInContentBlocks,
    parseIndexedInputFieldPath,
} from "./contentBlocksCaret";

describe("contentBlocksCaret", () => {
    it("parses indexed template input field paths", () => {
        expect(parseIndexedInputFieldPath("/abstract_es/2")).toEqual({
            basePath: "/abstract_es",
            paragraphIndex: 2,
        });
        expect(parseIndexedInputFieldPath("/abstract_text")).toBeNull();
    });

    it("converts between global and per-paragraph caret offsets", () => {
        const paragraphs = [
            [createRichText("Hello")],
            [createRichText("World")],
        ];

        expect(globalCaretInContentBlocks(paragraphs, 1, 2)).toBe(7);
        expect(localCaretInContentBlocks(paragraphs, 7)).toEqual({
            paragraphIndex: 1,
            localCaret: 2,
        });
    });
});
