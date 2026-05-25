import { describe, expect, it } from "vitest";
import {
    defaultCitationKey,
    formValueFromReference,
    formatReferenceCitation,
    referenceFromFormValue,
    validateReferenceForm,
    type ReferenceFormValue,
} from "./biblatex";

const completeArticleForm = (): ReferenceFormValue => ({
    entryType: "article",
    title: "Niñez y escritura",
    authors: "Ana García\nLuis Pérez",
    year: "2024",
    containerTitle: "Revista de Pruebas",
    publisher: "",
    doi: "10.1234/demo",
    url: "",
});

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

    it("always derives the citation key from the entry id", () => {
        expect(defaultCitationKey("local-abc-123")).toBe("local-abc-123");
        const reference = referenceFromFormValue("ref-2", {
            entryType: "misc",
            title: "Untitled Reference",
            authors: "Ada Lovelace",
            year: "1843",
            containerTitle: "",
            publisher: "",
            doi: "",
            url: "",
        });

        expect(reference.citation_key).toBe("ref-2");
        expect(reference.biblatex).toContain("@misc{ref-2,");
    });

    it("requires title, authors, year, and type-specific container fields", () => {
        expect(validateReferenceForm(completeArticleForm())).toBeNull();
        expect(
            validateReferenceForm({
                ...completeArticleForm(),
                title: "",
            }),
        ).toBe("title");
        expect(
            validateReferenceForm({
                ...completeArticleForm(),
                containerTitle: "",
            }),
        ).toBe("journal");
        expect(
            validateReferenceForm({
                entryType: "book",
                title: "Book",
                authors: "Author",
                year: "2020",
                containerTitle: "",
                publisher: "",
                doi: "",
                url: "",
            }),
        ).toBe("publisher");
        expect(
            validateReferenceForm({
                entryType: "inproceedings",
                title: "Paper",
                authors: "Author",
                year: "2020",
                containerTitle: "",
                publisher: "",
                doi: "",
                url: "",
            }),
        ).toBe("booktitle");
    });
});
