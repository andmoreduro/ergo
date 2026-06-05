import { describe, expect, it } from "vitest";
import { parseBiblatexEntry } from "./biblatexParse";

describe("parseBiblatexEntry", () => {
    it("reads nested braces inside field values", () => {
        const parsed = parseBiblatexEntry(`@article{demo,
  author = {given-i=JS, given={Joshua S.}, family=Gans},
  title = {Hello {world}},
}`);

        expect(parsed?.fields.get("author")).toBe(
            "given-i=JS, given={Joshua S.}, family=Gans",
        );
        expect(parsed?.fields.get("title")).toBe("Hello {world}");
    });
});
