import { describe, expect, it } from "vitest";

import {

    compareBibliographyEntries,

    defaultCitationKey,

    emptyReferenceAuthor,

    formValueFromLookupBiblatex,
    formValueFromReference,

    formatReferenceCitation,

    referenceFromFormValue,

    validateReferenceForm,

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

        expect(form.authors).toEqual([

            {

                givenInitial: "A",

                given: "Ajay",

                family: "Agrawal",

                prefix: "",

                suffix: "",

            },

            {

                givenInitial: "JS",

                given: "Joshua S.",

                family: "Gans",

                prefix: "",

                suffix: "",

            },

            {

                givenInitial: "A",

                given: "Avi",

                family: "Goldfarb",

                prefix: "",

                suffix: "",

            },

        ]);

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



        const roundTrip = referenceFromFormValue(reference.id, form);

        const parsed = parseBiblatexEntry(roundTrip.biblatex);

        expect(parsed?.fields.get("author")).toBe(

            "given-i=A, given=Ajay, family=Agrawal and given-i=JS, given={Joshua S.}, family=Gans and given-i=A, given=Avi, family=Goldfarb",

        );

        expect(parsed?.fields.get("volume")).toBe("381");

        expect(parsed?.fields.get("date")).toBe("2023-07-13");

        expect(formatReferenceCitation(reference)).toBe(

            "Agrawal; Gans; Goldfarb (2023). Do we want less automation?. Science.",

        );

    });



    it("always derives the citation key from the entry id", () => {

        expect(defaultCitationKey("local-abc-123")).toBe("local-abc-123");

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



    it("allows saving incomplete reference forms", () => {
        expect(validateReferenceForm(completeArticleForm())).toBeNull();
        expect(
            validateReferenceForm({
                ...completeArticleForm(),
                fields: { ...completeArticleForm().fields, title: "" },
            }),
        ).toBeNull();
        expect(
            validateReferenceForm({
                entryType: "article",
                authors: [],
                fields: {},
                extraFields: {},
            }),
        ).toBeNull();
    });



    it("maps BibTeX journal fields from translation-server export", () => {
        const form = formValueFromLookupBiblatex(`@article{smith2020,
  author = {Smith, Jane},
  title = {Example Paper},
  journal = {Nature},
  year = {2020}
}`);

        expect(form?.entryType).toBe("article");
        expect(form?.fields.journaltitle).toBe("Nature");
        expect(form?.fields.title).toBe("Example Paper");
        expect(form?.fields.year).toBe("2020");
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

