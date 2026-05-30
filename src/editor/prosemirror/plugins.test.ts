import { describe, expect, it } from "vitest";
import { bodySchema } from "./schema";
import { idFixesForDoc } from "./plugins";

const para = (elementId: string, text: string) =>
    bodySchema.nodes.paragraph.create({ elementId }, bodySchema.text(text));

describe("idFixesForDoc", () => {
    it("returns no fixes when every block has a unique id", () => {
        const doc = bodySchema.nodes.doc.create(null, [
            para("p1", "one"),
            para("p2", "two"),
        ]);
        expect(idFixesForDoc(doc)).toEqual([]);
    });

    it("flags a duplicate id (the split-off second block)", () => {
        const first = para("p1", "hello");
        const doc = bodySchema.nodes.doc.create(null, [first, para("p1", "world")]);
        const fixes = idFixesForDoc(doc);
        expect(fixes).toHaveLength(1);
        expect(fixes[0]).toBe(first.nodeSize); // position of the second block
    });

    it("flags an empty id (pasted block)", () => {
        const doc = bodySchema.nodes.doc.create(null, [
            para("p1", "kept"),
            para("", "pasted"),
        ]);
        expect(idFixesForDoc(doc)).toHaveLength(1);
    });
});
