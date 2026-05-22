import { describe, expect, it } from "vitest";
import {
    formValueFromReference,
    formatReferenceCitation,
    referenceFromFormValue,
    type ReferenceFormValue,
} from "./biblatex";

describe("bibliography BibLaTeX form mapping", () => {
    it("generates BibLaTeX from form fields and reads it back into the form", () => {
        const form: ReferenceFormValue = {
            entryType: "article",
            citationKey: "garcia2024",
            title: "Niñez y escritura",
            authors: "Ana García\nLuis Pérez",
            year: "2024",
            containerTitle: "Revista de Pruebas",
            publisher: "",
            doi: "10.1234/demo",
            url: "",
        };

        const reference = referenceFromFormValue("ref-1", form);

        expect(reference).toEqual({
            id: "ref-1",
            citation_key: "garcia2024",
            biblatex:
                "@article{garcia2024,\n" +
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

    it("uses a safe citation key when the form key is empty", () => {
        const reference = referenceFromFormValue("ref-2", {
            entryType: "misc",
            citationKey: "",
            title: "Untitled Reference",
            authors: "",
            year: "",
            containerTitle: "",
            publisher: "",
            doi: "",
            url: "",
        });

        expect(reference.citation_key).toBe("ref-2");
        expect(reference.biblatex).toContain("@misc{ref-2,");
    });
});
