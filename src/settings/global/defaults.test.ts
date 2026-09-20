import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
    DEFAULT_GLOBAL_SETTINGS,
    mergeGlobalSettings,
    mergeRecentProjectLists,
} from "./defaults";

describe("DEFAULT_GLOBAL_SETTINGS alignment with the shipped defaults file", () => {
    // src-tauri/defaults/default_settings.json is the product source of truth
    // (embedded into GlobalSettings::default()); this copy only covers the
    // pre-IPC boot window. If this fails, update the JSON or mirror it here.
    const shipped = JSON.parse(
        readFileSync(
            resolve(__dirname, "../../../src-tauri/defaults/default_settings.json"),
            "utf8",
        ),
    );

    it("mirrors the shipped defaults field for field", () => {
        expect(DEFAULT_GLOBAL_SETTINGS).toEqual(shipped);
    });
});

describe("mergeGlobalSettings", () => {
    it("fills null and missing fields from the defaults", () => {
        const merged = mergeGlobalSettings({
            theme_mode: "dark",
            history_limit: null,
        });
        expect(merged.theme_mode).toBe("dark");
        expect(merged.history_limit).toBe(DEFAULT_GLOBAL_SETTINGS.history_limit);
        expect(merged.recent_projects).toEqual([]);
    });
});

describe("mergeRecentProjectLists", () => {
    it("prefers primary order and deduplicates", () => {
        expect(
            mergeRecentProjectLists(
                ["/b.ergproj", "/a.ergproj"],
                ["/a.ergproj", "/c.ergproj"],
            ),
        ).toEqual(["/b.ergproj", "/a.ergproj", "/c.ergproj"]);
    });

    it("caps at eight entries", () => {
        const primary = Array.from({ length: 5 }, (_, index) => `/p${index}.ergproj`);
        const secondary = Array.from({ length: 5 }, (_, index) => `/s${index}.ergproj`);
        expect(mergeRecentProjectLists(primary, secondary)).toHaveLength(8);
    });
});
