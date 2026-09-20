import { describe, expect, it } from "vitest";
import { parseBiblatexEntry, serializeBiblatexEntry } from "./biblatexParse";

describe("parseBiblatexEntry", () => {
    it("reads the entry type (lowercased), citation key, and nested braces", () => {
        const parsed = parseBiblatexEntry(`@ARTICLE{demo-key,
  author = {given-i=JS, given={Joshua S.}, family=Gans},
  title = {Hello {world}},
}`);

        expect(parsed?.entryType).toBe("article");
        expect(parsed?.citationKey).toBe("demo-key");
        expect(parsed?.fields.get("author")).toBe(
            "given-i=JS, given={Joshua S.}, family=Gans",
        );
        expect(parsed?.fields.get("title")).toBe("Hello {world}");
    });

    it("reads quoted values with escaped quotes", () => {
        const parsed = parseBiblatexEntry(
            `@misc{quoted, title = "Say \\"hi\\"", year = {2024}}`,
        );

        expect(parsed?.fields.get("title")).toBe('Say \\"hi\\"');
        expect(parsed?.fields.get("year")).toBe("2024");
    });

    it("keeps later fields after bare macro or numeric values", () => {
        const parsed = parseBiblatexEntry(`@article{bare,
  month = jan,
  year = {2020},
  volume = 12,
  title = {Kept}
}`);

        expect(parsed?.fields.get("month")).toBe("jan");
        expect(parsed?.fields.get("year")).toBe("2020");
        expect(parsed?.fields.get("volume")).toBe("12");
        expect(parsed?.fields.get("title")).toBe("Kept");
    });

    it("joins concatenated values and resumes after an unreadable field", () => {
        const parsed = parseBiblatexEntry(`@misc{concat,
  title = {Part } # "two",
  broken = ,
  year = {2021}
}`);

        expect(parsed?.fields.get("title")).toBe("Part two");
        expect(parsed?.fields.has("broken")).toBe(false);
        expect(parsed?.fields.get("year")).toBe("2021");
    });

    it("parses every field of a Zotero BibLaTeX article export", () => {
        const parsed = parseBiblatexEntry(`@article{smith_deep_2020,
  title = {Deep learning for {DNA} sequencing: a review},
  author = {Smith, Jane A. and Doe, John},
  date = {2020-05-14},
  journaltitle = {Nature Methods},
  shortjournal = {Nat. Methods},
  volume = {17},
  number = {5},
  pages = {473--482},
  issn = {1548-7091},
  doi = {10.1038/s41592-020-0001-x},
  url = {https://www.nature.com/articles/s41592-020-0001-x},
  urldate = {2024-01-15},
  langid = {english},
  file = {Full Text PDF:/home/user/Zotero/storage/ABCD1234/Smith - 2020.pdf:application/pdf}
}`);

        expect(parsed?.entryType).toBe("article");
        expect(Object.fromEntries(parsed?.fields ?? [])).toMatchObject({
            date: "2020-05-14",
            journaltitle: "Nature Methods",
            volume: "17",
            number: "5",
            pages: "473--482",
            doi: "10.1038/s41592-020-0001-x",
            urldate: "2024-01-15",
            url: "https://www.nature.com/articles/s41592-020-0001-x",
        });
        expect(parsed?.fields.size).toBe(14);
    });

    it("returns null for malformed input", () => {
        expect(parseBiblatexEntry("not an entry")).toBeNull();
        expect(parseBiblatexEntry("@")).toBeNull();
        expect(parseBiblatexEntry("@article{key")).toBeNull();
        // Unterminated field value brace.
        expect(parseBiblatexEntry("@article{key, title = {oops")).toBeNull();
        expect(parseBiblatexEntry("")).toBeNull();
    });
});

describe("serializeBiblatexEntry", () => {
    it("drops empty values and wraps remaining fields in braces", () => {
        const serialized = serializeBiblatexEntry(
            "article",
            "key",
            new Map([
                ["title", "Demo"],
                ["note", "   "],
                ["year", "2024"],
            ]),
        );

        expect(serialized).toBe("@article{key,\n  title = {Demo},\n  year = {2024}\n}");
    });
});
