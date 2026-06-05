import { m } from "../paraglide/messages.js";
import type { BibliographyEntryType } from "./biblatexEntryTypes";

export type BibliographyValidationCode =
    | "title"
    | "authors"
    | "year"
    | "journal"
    | "booktitle"
    | "publisher"
    | "institution"
    | "number";

export type ReferenceFieldKey =
    | "title"
    | "year"
    | "date"
    | "journaltitle"
    | "booktitle"
    | "publisher"
    | "location"
    | "volume"
    | "number"
    | "issue"
    | "pages"
    | "doi"
    | "url"
    | "urldate"
    | "editor"
    | "institution"
    | "edition"
    | "note";

export type ReferenceFieldImportance = "required" | "optional";

export type ReferenceFieldSpec = {
    key: ReferenceFieldKey;
    importance: ReferenceFieldImportance;
};

const IDENTIFIERS: ReferenceFieldSpec[] = [
    { key: "doi", importance: "optional" },
    { key: "url", importance: "optional" },
];

const ARTICLE_LIKE: ReferenceFieldSpec[] = [
    { key: "title", importance: "optional" },
    { key: "year", importance: "optional" },
    { key: "date", importance: "optional" },
    { key: "journaltitle", importance: "optional" },
    { key: "volume", importance: "optional" },
    { key: "number", importance: "optional" },
    { key: "issue", importance: "optional" },
    { key: "pages", importance: "optional" },
    ...IDENTIFIERS,
];

const BOOK_LIKE: ReferenceFieldSpec[] = [
    { key: "title", importance: "optional" },
    { key: "year", importance: "optional" },
    { key: "date", importance: "optional" },
    { key: "publisher", importance: "optional" },
    { key: "location", importance: "optional" },
    { key: "edition", importance: "optional" },
    { key: "volume", importance: "optional" },
    { key: "pages", importance: "optional" },
    { key: "editor", importance: "optional" },
    ...IDENTIFIERS,
];

const INBOOK_LIKE: ReferenceFieldSpec[] = [
    { key: "title", importance: "optional" },
    { key: "year", importance: "optional" },
    { key: "date", importance: "optional" },
    { key: "booktitle", importance: "optional" },
    { key: "editor", importance: "optional" },
    { key: "publisher", importance: "optional" },
    { key: "location", importance: "optional" },
    { key: "volume", importance: "optional" },
    { key: "pages", importance: "optional" },
    ...IDENTIFIERS,
];

const THESIS_LIKE: ReferenceFieldSpec[] = [
    { key: "title", importance: "optional" },
    { key: "year", importance: "optional" },
    { key: "date", importance: "optional" },
    { key: "institution", importance: "optional" },
    { key: "location", importance: "optional" },
    ...IDENTIFIERS,
];

const ONLINE_LIKE: ReferenceFieldSpec[] = [
    { key: "title", importance: "optional" },
    { key: "year", importance: "optional" },
    { key: "date", importance: "optional" },
    { key: "url", importance: "optional" },
    { key: "urldate", importance: "optional" },
    { key: "doi", importance: "optional" },
    { key: "note", importance: "optional" },
];

const MINIMAL: ReferenceFieldSpec[] = [
    { key: "title", importance: "optional" },
    { key: "year", importance: "optional" },
    { key: "date", importance: "optional" },
    { key: "note", importance: "optional" },
    ...IDENTIFIERS,
];

const PATENT_FIELDS: ReferenceFieldSpec[] = [
    { key: "title", importance: "optional" },
    { key: "year", importance: "optional" },
    { key: "date", importance: "optional" },
    { key: "number", importance: "optional" },
    { key: "institution", importance: "optional" },
    ...IDENTIFIERS,
];

const ENTRY_FIELD_SPECS: Record<BibliographyEntryType, ReferenceFieldSpec[]> = {
    article: ARTICLE_LIKE,
    periodical: ARTICLE_LIKE,
    book: BOOK_LIKE,
    booklet: BOOK_LIKE,
    collection: BOOK_LIKE,
    proceedings: BOOK_LIKE,
    manual: BOOK_LIKE,
    report: BOOK_LIKE,
    techreport: BOOK_LIKE,
    inbook: INBOOK_LIKE,
    incollection: INBOOK_LIKE,
    inproceedings: INBOOK_LIKE,
    conference: INBOOK_LIKE,
    inreference: INBOOK_LIKE,
    thesis: THESIS_LIKE,
    mastersthesis: THESIS_LIKE,
    phdthesis: THESIS_LIKE,
    online: ONLINE_LIKE,
    software: ONLINE_LIKE,
    patent: PATENT_FIELDS,
    misc: MINIMAL,
    unpublished: MINIMAL,
    reference: MINIMAL,
    dataset: MINIMAL,
};

export const referenceFieldsForEntryType = (
    entryType: BibliographyEntryType,
): ReferenceFieldSpec[] => ENTRY_FIELD_SPECS[entryType];

export const referenceFieldLabel = (key: ReferenceFieldKey): string => {
    switch (key) {
        case "title":
            return m.references_title();
        case "year":
            return m.references_year();
        case "date":
            return m.references_date();
        case "journaltitle":
            return m.references_journal();
        case "booktitle":
            return m.references_booktitle();
        case "publisher":
            return m.references_publisher();
        case "location":
            return m.references_location();
        case "volume":
            return m.references_volume();
        case "number":
            return m.references_number();
        case "issue":
            return m.references_issue();
        case "pages":
            return m.references_pages();
        case "doi":
            return m.references_doi();
        case "url":
            return m.references_url();
        case "urldate":
            return m.references_urldate();
        case "editor":
            return m.references_editor();
        case "institution":
            return m.references_institution();
        case "edition":
            return m.references_edition();
        case "note":
            return m.references_note();
    }
};

export const validationCodeForField = (
    key: ReferenceFieldKey,
): BibliographyValidationCode => {
    switch (key) {
        case "title":
            return "title";
        case "year":
        case "date":
            return "year";
        case "journaltitle":
            return "journal";
        case "booktitle":
            return "booktitle";
        case "publisher":
            return "publisher";
        case "number":
            return "number";
        case "institution":
            return "institution";
        default:
            return "title";
    }
};

export const FORM_MANAGED_BIBLATEX_FIELDS = new Set<string>([
    "author",
    "title",
    "year",
    "date",
    "journaltitle",
    "booktitle",
    "publisher",
    "location",
    "volume",
    "number",
    "issue",
    "pages",
    "doi",
    "url",
    "urldate",
    "editor",
    "institution",
    "edition",
    "note",
]);
