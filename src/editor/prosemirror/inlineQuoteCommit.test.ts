import { describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import { bodySchema } from "./schema";
import { bodyPlugins } from "./plugins";
import { createRichText } from "../../state/ast/defaults";
import { docToElements, elementToNode, fragmentToRichText } from "./astBridge";
import { diffSectionElements } from "./sectionDiff";
import { applyDocumentEvents } from "../../state/documentEvents";

describe("inline quote PM commits", () => {
    it("treats inline quote source attr updates as doc changes", () => {
        const paragraph = bodySchema.nodes.paragraph.create(
            { elementId: "p1" },
            [
                bodySchema.nodes.inlineQuote.create({
                    source: "",
                    label: "",
                }),
            ],
        );
        const doc = bodySchema.nodes.doc.create(null, [paragraph]);
        const state = EditorState.create({ doc, plugins: bodyPlugins() });
        const pos = 1;
        const tr = state.tr.setNodeMarkup(pos, undefined, {
            ...state.doc.nodeAt(pos)!.attrs,
            source: "typed",
            label: "typed",
        });
        expect(tr.docChanged).toBe(true);

        const next = state.apply(tr);
        const elements = docToElements(next.doc);
        expect(elements[0]?.type).toBe("Paragraph");
        if (elements[0]?.type === "Paragraph") {
            expect(elements[0].content).toEqual([
                {
                    ...createRichText("typed"),
                    kind: "quote",
                    quote_attribution_text: null,
                    quote_attribution_reference_id: null,
                },
            ]);
        }
    });

    it("diffs inline quote typing to updateParagraphContent", () => {
        const prev = [
            {
                type: "Paragraph" as const,
                id: "p1",
                content: [],
            },
        ];
        const next = [
            {
                type: "Paragraph" as const,
                id: "p1",
                content: [
                    {
                        ...createRichText("hello"),
                        kind: "quote" as const,
                        quote_attribution_text: null,
                        quote_attribution_reference_id: null,
                    },
                ],
            },
        ];
        const delta = diffSectionElements("sec", prev, next);
        expect(delta.forward).toHaveLength(1);
        expect(delta.forward[0]?.type).toBe("updateParagraphContent");
        expect(applyDocumentEvents(
            {
                version: "1.0",
                metadata: {
                    template_id: "t",
                    template_variant_id: null,
                    title: "",
                    running_head: null,
                    keywords: [],
                    project_settings: {},
                    local_overrides: {},
                },
                dependencies: { packages: [] },
                references: [],
                assets: [],
                inputs: {},
                sections: [
                    {
                        id: "sec",
                        type: "Content",
                        is_optional: false,
                        elements: prev,
                    },
                ],
            },
            delta.forward,
        ).sections[0]).toMatchObject({
            type: "Content",
            elements: next,
        });
    });
});
