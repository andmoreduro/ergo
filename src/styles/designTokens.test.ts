import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = join(process.cwd(), "src");
const tokenSourceFiles = new Set([
    join(srcRoot, "styles", "variables.css"),
]);

const rawColorPattern = /(?:#[0-9a-fA-F]{3,8}|\brgba?\(|\bhsla?\()/;

const namedColorValuePattern =
    /\b(?:color|background(?:-color)?|outline-color|border(?:-top|-right|-bottom|-left)?-color|fill|stroke)\s*:\s*(?:white|black)\s*[;!]/i;

const rawDimensionPattern = /(?<![-\w])(\d+(?:\.\d+)?)(px|rem|vh|vw|em)\b/;

const collectStyleFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
            return collectStyleFiles(path);
        }

        if (path.endsWith(".module.css") || path.endsWith("App.module.css")) {
            return [path];
        }

        if (path.endsWith(".css") && path.includes(`${join("src", "styles")}`)) {
            return [path];
        }

        return [];
    });

const applicationStyleFiles = (): string[] =>
    collectStyleFiles(srcRoot).filter((file) => !tokenSourceFiles.has(file));

describe("design tokens", () => {
    it("keeps raw color literals out of application stylesheets", () => {
        const offenders = applicationStyleFiles()
            .filter((file) => rawColorPattern.test(readFileSync(file, "utf8")))
            .map((file) => relative(process.cwd(), file));

        expect(offenders).toEqual([]);
    });

    it("keeps named white/black color values out of application stylesheets", () => {
        const offenders = applicationStyleFiles()
            .filter((file) =>
                namedColorValuePattern.test(readFileSync(file, "utf8")),
            )
            .map((file) => relative(process.cwd(), file));

        expect(offenders).toEqual([]);
    });

    it("keeps raw dimension literals out of application stylesheets", () => {
        const offenders = applicationStyleFiles()
            .filter((file) =>
                rawDimensionPattern.test(readFileSync(file, "utf8")),
            )
            .map((file) => relative(process.cwd(), file));

        expect(offenders).toEqual([]);
    });
});
