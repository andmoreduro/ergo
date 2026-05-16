import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const componentCssRoot = join(process.cwd(), "src", "components");
const rawColorPattern = /(?:#[0-9a-fA-F]{3,8}|\brgba?\(|\bhsla?\()/;

const cssModuleFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
            return cssModuleFiles(path);
        }

        return path.endsWith(".module.css") ? [path] : [];
    });

describe("component design tokens", () => {
    it("keeps raw color literals out of component CSS modules", () => {
        const offenders = cssModuleFiles(componentCssRoot).filter((file) =>
            rawColorPattern.test(readFileSync(file, "utf8")),
        );

        expect(offenders).toEqual([]);
    });
});
