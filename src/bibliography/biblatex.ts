import type { ReferenceEntry } from "../bindings/ReferenceEntry";

export type BibliographyEntryType = "article" | "book" | "misc";

export interface ReferenceFormValue {
    entryType: BibliographyEntryType;
    citationKey: string;
    title: string;
    authors: string;
    year: string;
    containerTitle: string;
    publisher: string;
    doi: string;
    url: string;
}

export const emptyReferenceFormValue = (): ReferenceFormValue => ({
    entryType: "article",
    citationKey: "",
    title: "",
    authors: "",
    year: "",
    containerTitle: "",
    publisher: "",
    doi: "",
    url: "",
});

const FIELD_NAMES = [
    "author",
    "title",
    "year",
    "journaltitle",
    "publisher",
    "doi",
    "url",
] as const;

const sanitizeCitationKey = (value: string, fallback: string): string => {
    const key = value.trim().replace(/\s+/g, "-").replace(/[{},\\]/g, "");
    return key.length > 0 ? key : fallback;
};

const escapeBiblatexValue = (value: string): string =>
    value.replace(/\\/g, "\\\\").replace(/[{}]/g, (match) => `\\${match}`);

const unescapeBiblatexValue = (value: string): string =>
    value.replace(/\\([{}\\])/g, "$1");

const authorsToBiblatex = (value: string): string =>
    value
        .split(/\r?\n|;/)
        .map((author) => author.trim())
        .filter(Boolean)
        .join(" and ");

const authorsFromBiblatex = (value: string): string =>
    value
        .split(/\s+and\s+/)
        .map((author) => author.trim())
        .filter(Boolean)
        .join("\n");

const readEntryHeader = (
    biblatex: string,
): Pick<ReferenceFormValue, "entryType" | "citationKey"> | null => {
    const match = biblatex.match(/^\s*@([a-zA-Z]+)\s*\{\s*([^,\s]+)\s*,/);
    if (!match) {
        return null;
    }

    const entryType = match[1].toLocaleLowerCase();
    return {
        entryType:
            entryType === "article" || entryType === "book" ? entryType : "misc",
        citationKey: match[2],
    };
};

const readBiblatexFields = (biblatex: string): Record<string, string> => {
    const fields: Record<string, string> = {};

    for (const field of FIELD_NAMES) {
        const pattern = new RegExp(`${field}\\s*=\\s*\\{([^}]*)\\}`, "i");
        const match = biblatex.match(pattern);
        if (match) {
            fields[field] = unescapeBiblatexValue(match[1].trim());
        }
    }

    return fields;
};

export const referenceFromFormValue = (
    id: string,
    form: ReferenceFormValue,
): ReferenceEntry => {
    const citationKey = sanitizeCitationKey(form.citationKey, id);
    const candidateFields: Array<[string, string]> = [
        ["author", authorsToBiblatex(form.authors)],
        ["title", form.title.trim()],
        ["year", form.year.trim()],
        [
            form.entryType === "article" ? "journaltitle" : "publisher",
            form.entryType === "article"
                ? form.containerTitle.trim()
                : form.publisher.trim(),
        ],
        ["doi", form.doi.trim()],
        ["url", form.url.trim()],
    ];
    const fields = candidateFields.filter(([, value]) => value.length > 0);

    const fieldLines = fields.map(
        ([key, value], index) =>
            `  ${key} = {${escapeBiblatexValue(value)}}${
                index === fields.length - 1 ? "" : ","
            }`,
    );

    return {
        id,
        citation_key: citationKey,
        biblatex: `@${form.entryType}{${citationKey},\n${fieldLines.join("\n")}\n}`,
    };
};

export const formValueFromReference = (
    reference: ReferenceEntry,
): ReferenceFormValue => {
    const header = readEntryHeader(reference.biblatex);
    const fields = readBiblatexFields(reference.biblatex);

    return {
        entryType: header?.entryType ?? "misc",
        citationKey: header?.citationKey ?? reference.citation_key,
        title: fields.title ?? "",
        authors: fields.author ? authorsFromBiblatex(fields.author) : "",
        year: fields.year ?? "",
        containerTitle: fields.journaltitle ?? "",
        publisher: fields.publisher ?? "",
        doi: fields.doi ?? "",
        url: fields.url ?? "",
    };
};

const authorDisplayName = (author: string): string => {
    const trimmed = author.trim();
    if (!trimmed) {
        return "";
    }

    if (trimmed.includes(",")) {
        return trimmed.split(",")[0].trim();
    }

    const parts = trimmed.split(/\s+/);
    return parts[parts.length - 1];
};

export const formatReferenceCitation = (reference: ReferenceEntry): string => {
    const form = formValueFromReference(reference);
    const authors = form.authors
        .split(/\r?\n/)
        .map(authorDisplayName)
        .filter(Boolean)
        .join("; ");
    const lead = [authors, form.year ? `(${form.year})` : ""]
        .filter(Boolean)
        .join(" ");
    const title = form.title.trim();
    const container =
        form.entryType === "article"
            ? form.containerTitle.trim()
            : form.publisher.trim();

    return [lead, title, container]
        .filter(Boolean)
        .map((part) => (part.endsWith(".") ? part : `${part}.`))
        .join(" ");
};
