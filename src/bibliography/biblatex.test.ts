import { describe, expect, it } from "vitest";

import {
    compareBibliographyEntries,
    defaultCitationKey,
    emptyReferenceAuthor,
    formValueFromLookupBiblatex,
    formValueFromReference,
    formatReferenceCitation,
    mergeLookupIntoForm,
    referenceFromFormValue,
    type ReferenceFormValue,
} from "./biblatex";

import { parseBiblatexEntry } from "./biblatexParse";

const completeArticleForm = (): ReferenceFormValue => ({
    entryType: "article",
    authors: [
        { ...emptyReferenceAuthor(), given: "Ana", family: "García" },
        { ...emptyReferenceAuthor(), given: "Luis", family: "Pérez" },
    ],
    fields: {
        title: "Niñez y escritura",
        year: "2024",
        journaltitle: "Revista de Pruebas",
        doi: "10.1234/demo",
    },
    extraFields: {},
});

const agrawalBiblatex = `@article{agrawal-2023,
  author = {given-i=A, given=Ajay, family=Agrawal and given-i=JS, given={Joshua S.}, family=Gans and given-i=A, given=Avi, family=Goldfarb},
  date = {2023-07-13},
  doi = {10.1126/science.adh9429},
  journaltitle = {Science},
  number = {6654},
  pages = {155--158},
  title = {Do we want less automation?},
  url = {https://doi.org/10.1126/science.adh9429},
  volume = {381},
}`;

describe("bibliography BibLaTeX form mapping", () => {
    it("generates BibLaTeX from form fields and reads it back into the form", () => {
        const form = completeArticleForm();

        const reference = referenceFromFormValue("ref-1", form);

        expect(reference).toEqual({
            id: "ref-1",
            citation_key: "ref-1",
            biblatex:
                "@article{ref-1,\n" +
                "  author = {Ana García and Luis Pérez},\n" +
                "  title = {Niñez y escritura},\n" +
                "  year = {2024},\n" +
                "  journaltitle = {Revista de Pruebas},\n" +
                "  doi = {10.1234/demo}\n" +
                "}",
        });

        expect(formValueFromReference(reference)).toEqual(form);

        expect(formatReferenceCitation(reference)).toBe(
            "García; Pérez (2024). Niñez y escritura. Revista de Pruebas.",
        );
    });

    it("preserves BibLaTeX name-list authors and structured fields", () => {
        const reference = {
            id: "agrawal-2023",
            citation_key: "agrawal-2023",
            biblatex: agrawalBiblatex,
        };

        const form = formValueFromReference(reference);

        expect(
            form.authors.map(
                (author) => `${author.givenInitial}|${author.given}|${author.family}`,
            ),
        ).toEqual(["A|Ajay|Agrawal", "JS|Joshua S.|Gans", "A|Avi|Goldfarb"]);

        expect(form.fields.year).toBe("2023");
        expect(form.fields.title).toBe("Do we want less automation?");
        expect(form.fields.journaltitle).toBe("Science");
        expect(form.fields.date).toBe("2023-07-13");
        expect(form.fields.number).toBe("6654");
        expect(form.fields.pages).toBe("155--158");
        expect(form.fields.volume).toBe("381");
        expect(form.fields.doi).toBe("10.1126/science.adh9429");
        expect(form.fields.url).toBe("https://doi.org/10.1126/science.adh9429");
        expect(form.extraFields).toEqual({});

        const roundTrip = parseBiblatexEntry(
            referenceFromFormValue(reference.id, form).biblatex,
        );

        expect(roundTrip?.fields.get("volume")).toBe("381");
        expect(roundTrip?.fields.get("date")).toBe("2023-07-13");

        expect(formatReferenceCitation(reference)).toBe(
            "Agrawal; Gans; Goldfarb (2023). Do we want less automation?. Science.",
        );
    });

    it("sanitizes citation keys and falls back when the id is blank", () => {
        expect(defaultCitationKey("My Ref {x}")).toBe("My-Ref-x");
        expect(defaultCitationKey("   ")).toBe("ref");

        const reference = referenceFromFormValue("ref-2", {
            entryType: "misc",
            authors: [{ ...emptyReferenceAuthor(), family: "Lovelace", given: "Ada" }],
            fields: {
                title: "Untitled Reference",
                year: "1843",
            },
            extraFields: {},
        });

        expect(reference.citation_key).toBe("ref-2");
        expect(reference.biblatex).toContain("@misc{ref-2,");
    });

    it("maps legacy BibTeX field names from translation-server export", () => {
        const article = formValueFromLookupBiblatex(`@article{smith2020,
  author = {Smith, Jane},
  title = {Example Paper},
  journal = {Nature},
  year = {2020}
}`);

        expect(article?.entryType).toBe("article");
        expect(article?.fields.journaltitle).toBe("Nature");
        expect(article?.fields.title).toBe("Example Paper");
        expect(article?.fields.year).toBe("2020");

        const thesis = formValueFromLookupBiblatex(`@thesis{loomis1930,
  title = {On the theory of the differential analyzer},
  school = {MIT},
  address = {Cambridge},
  year = {1930}
}`);

        expect(thesis?.entryType).toBe("thesis");
        expect(thesis?.fields.institution).toBe("MIT");
        expect(thesis?.fields.location).toBe("Cambridge");
    });

    it("returns null when the lookup BibLaTeX cannot be parsed", () => {
        expect(formValueFromLookupBiblatex("not an entry")).toBeNull();
    });

    it("preserves fields the current entry type's form does not show", () => {
        const reference = {
            id: "note-2020",
            citation_key: "note-2020",
            biblatex: `@article{note-2020,
  author = {Lovelace, Ada},
  title = {Notes on the engine},
  date = {2020-01-02},
  note = {Reprinted},
  urldate = {2024-01-15},
  publisher = {Analytical Press},
  langid = {english}
}`,
        };

        const form = formValueFromReference(reference);
        expect(form.fields.note).toBe("Reprinted");
        expect(form.fields.urldate).toBe("2024-01-15");
        expect(form.extraFields).toEqual({
            publisher: "Analytical Press",
            langid: "english",
        });

        const saved = referenceFromFormValue(reference.id, form);
        const roundTrip = parseBiblatexEntry(saved.biblatex);
        expect(roundTrip?.fields.get("note")).toBe("Reprinted");
        expect(roundTrip?.fields.get("urldate")).toBe("2024-01-15");
        expect(roundTrip?.fields.get("publisher")).toBe("Analytical Press");
        expect(roundTrip?.fields.get("langid")).toBe("english");
        expect(formValueFromReference(saved)).toEqual(form);
    });

    it("decodes LaTeX escapes and drops library-local fields at the lookup boundary only", () => {
        const biblatex = `@article{escaped,
  title = {Research \\& Development: 100\\% of {DNA} \\{samples\\}},
  journaltitle = {Journal \\#1 \\$ \\_ {\\textasciitilde}home},
  file = {Full Text PDF:/home/user/Zotero/storage/ABCD1234/paper.pdf:application/pdf},
  year = {2020}
}`;

        const lookup = formValueFromLookupBiblatex(biblatex);
        expect(lookup?.fields.title).toBe(
            "Research & Development: 100% of {DNA} {samples}",
        );
        expect(lookup?.fields.journaltitle).toBe("Journal #1 $ _ ~home");
        expect(lookup?.extraFields).toEqual({});

        const stored = formValueFromReference({
            id: "escaped",
            citation_key: "escaped",
            biblatex,
        });
        expect(stored.fields.title).toBe(
            "Research \\& Development: 100\\% of {DNA} \\{samples\\}",
        );
        expect(stored.extraFields.file).toContain("paper.pdf");
    });

    it("merges a lookup result over an edited draft", () => {
        const current: ReferenceFormValue = {
            entryType: "article",
            authors: [{ ...emptyReferenceAuthor(), given: "Ada", family: "Lovelace" }],
            fields: { title: "Old title", note: "Keep this note", year: "1843" },
            extraFields: { langid: "english" },
        };
        const lookup: ReferenceFormValue = {
            entryType: "book",
            authors: [],
            fields: { title: "New title", publisher: "Analytical Press", year: "" },
            extraFields: { isbn: "978-0-306-40615-7" },
        };

        expect(mergeLookupIntoForm(current, lookup)).toEqual({
            entryType: "book",
            authors: current.authors,
            fields: {
                title: "New title",
                note: "Keep this note",
                year: "1843",
                publisher: "Analytical Press",
            },
            extraFields: { langid: "english", isbn: "978-0-306-40615-7" },
        });
    });

    it("sorts bibliography entries by localized citation label", () => {
        const alpha = referenceFromFormValue("a", {
            ...completeArticleForm(),
            fields: { ...completeArticleForm().fields, title: "Alpha" },
        });

        const beta = referenceFromFormValue("b", {
            ...completeArticleForm(),
            fields: { ...completeArticleForm().fields, title: "Beta" },
        });

        expect(compareBibliographyEntries(alpha, beta, "en")).toBeLessThan(0);
        expect(compareBibliographyEntries(beta, alpha, "en")).toBeGreaterThan(0);
    });
});
