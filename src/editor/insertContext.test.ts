import { describe, expect, it } from "vitest";
import type { ContentSection } from "../bindings/ContentSection";
import { createList, createParagraph } from "../state/ast/defaults";
import { resolveContentInsertAnchor } from "./insertContext";

describe("resolveContentInsertAnchor", () => {
    const section: ContentSection = {
        id: "body",
        is_optional: false,
        elements: [
            createParagraph("Hello", "p1"),
            createParagraph("", "empty"),
            createParagraph("Tail", "p3"),
        ],
    };

    it("replaces an empty paragraph anchor", () => {
        expect(resolveContentInsertAnchor(section, "empty")).toEqual({
            sectionId: "body",
            afterElementId: "empty",
            replaceElementId: "empty",
        });
    });

    it("inserts after non-empty anchors", () => {
        expect(resolveContentInsertAnchor(section, "p1")).toEqual({
            sectionId: "body",
            afterElementId: "p1",
            replaceElementId: null,
        });
    });

    it("replaces an empty list anchor", () => {
        const withList: ContentSection = {
            ...section,
            elements: [createList("list-empty")],
        };
        expect(resolveContentInsertAnchor(withList, "list-empty")).toEqual({
            sectionId: "body",
            afterElementId: "list-empty",
            replaceElementId: "list-empty",
        });
    });
});
