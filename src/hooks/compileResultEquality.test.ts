import { describe, expect, it } from "vitest";
import type { DocumentResources } from "../bindings/DocumentResources";
import type { ResourceEntry } from "../bindings/ResourceEntry";
import { outlineEqual, resourcesEqual } from "./compileResultEquality";

const entry = (overrides: Partial<ResourceEntry> = {}): ResourceEntry => ({
    id: "fig-1",
    kind: "figure",
    label: "Figure 1",
    subtitle: null,
    reference_token: "@fig-1",
    source_element_id: "el-1",
    asset_id: null,
    preview: {
        status: "ready",
        path: null,
        page_number: 1,
        content: null,
        diagnostic: null,
    },
    ...overrides,
});

const resources = (entries: ResourceEntry[], revision = 1n): DocumentResources => ({
    groups: [{ kind: "figure", label: "Figures", entries }],
    revision,
});

describe("outlineEqual", () => {
    it("treats same-length outlines with a renamed or moved heading as different", () => {
        const base = { entries: [{ level: 1, text: "Intro", page: 1 }] };
        expect(outlineEqual(base, { entries: [{ level: 1, text: "Intro", page: 1 }] })).toBe(true);
        expect(outlineEqual(base, { entries: [{ level: 1, text: "Intro!", page: 1 }] })).toBe(false);
        expect(outlineEqual(base, { entries: [{ level: 1, text: "Intro", page: 2 }] })).toBe(false);
        expect(outlineEqual(base, null)).toBe(false);
    });
});

describe("resourcesEqual", () => {
    it("ignores the per-compile revision but not entry content", () => {
        expect(resourcesEqual(resources([entry()], 1n), resources([entry()], 2n))).toBe(true);
        expect(
            resourcesEqual(resources([entry()]), resources([entry(), entry({ id: "fig-2" })])),
        ).toBe(false);
        expect(
            resourcesEqual(resources([entry()]), resources([entry({ label: "Figure 1b" })])),
        ).toBe(false);
        expect(
            resourcesEqual(
                resources([entry()]),
                resources([entry({ preview: { ...entry().preview, page_number: 2 } })]),
            ),
        ).toBe(false);
    });
});
