import { describe, expect, it } from "vitest";
import {
    authorToBiblatexPart,
    authorsFromBiblatex,
    authorsToBiblatex,
    emptyReferenceAuthor,
    parseAuthorPart,
} from "./biblatexAuthors";

describe("biblatexAuthors", () => {
    it("serializes simple given and family names", () => {
        const author = { ...emptyReferenceAuthor(), given: "Ana", family: "García" };
        expect(authorToBiblatexPart(author)).toBe("Ana García");
        expect(authorsToBiblatex([author])).toBe("Ana García");
    });

    it("serializes structured BibLaTeX name parts", () => {
        const author = {
            ...emptyReferenceAuthor(),
            givenInitial: "A",
            given: "Ajay",
            family: "Agrawal",
        };
        expect(authorToBiblatexPart(author)).toBe(
            "given-i=A, given=Ajay, family=Agrawal",
        );
    });

    it("serializes multi-word family names with structured parts", () => {
        const author = {
            ...emptyReferenceAuthor(),
            family: "Van der Berg",
        };
        expect(authorToBiblatexPart(author)).toBe("family={Van der Berg}");
    });

    it("round-trips simple and multi-word family names", () => {
        const cases = [
            { ...emptyReferenceAuthor(), family: "Van der Berg" },
            {
                ...emptyReferenceAuthor(),
                given: "Ana",
                family: "Van der Berg",
            },
        ];
        for (const author of cases) {
            const serialized = authorsToBiblatex([author]);
            expect(authorsFromBiblatex(serialized)).toEqual([author]);
        }
    });

    it("parses simple and structured author strings", () => {
        expect(parseAuthorPart("Ana García")).toEqual({
            ...emptyReferenceAuthor(),
            given: "Ana",
            family: "García",
        });
        expect(parseAuthorPart("García, Ana")).toEqual({
            ...emptyReferenceAuthor(),
            family: "García",
            given: "Ana",
        });
        expect(
            parseAuthorPart("given-i=JS, given={Joshua S.}, family=Gans"),
        ).toEqual({
            ...emptyReferenceAuthor(),
            givenInitial: "JS",
            given: "Joshua S.",
            family: "Gans",
        });
    });

    it("splits author lists on and", () => {
        expect(
            authorsFromBiblatex(
                "given-i=A, given=Ajay, family=Agrawal and Ana García",
            ),
        ).toEqual([
            {
                ...emptyReferenceAuthor(),
                givenInitial: "A",
                given: "Ajay",
                family: "Agrawal",
            },
            {
                ...emptyReferenceAuthor(),
                given: "Ana",
                family: "García",
            },
        ]);
    });
});
