import { m } from "../paraglide/messages.js";

/** BibLaTeX entry types supported in the bibliography form (biblatex regular + common aliases). */
export const BIBLIOGRAPHY_ENTRY_TYPES = [
    "article",
    "book",
    "booklet",
    "inbook",
    "incollection",
    "inproceedings",
    "proceedings",
    "conference",
    "manual",
    "misc",
    "online",
    "patent",
    "report",
    "techreport",
    "thesis",
    "mastersthesis",
    "phdthesis",
    "unpublished",
    "software",
    "dataset",
    "periodical",
    "collection",
    "reference",
    "inreference",
] as const;

export type BibliographyEntryType = (typeof BIBLIOGRAPHY_ENTRY_TYPES)[number];

const ENTRY_TYPE_SET = new Set<string>(BIBLIOGRAPHY_ENTRY_TYPES);

export const isBibliographyEntryType = (
    value: string,
): value is BibliographyEntryType => ENTRY_TYPE_SET.has(value);

export const normalizeBibliographyEntryType = (value: string): BibliographyEntryType =>
    isBibliographyEntryType(value.toLowerCase()) ? (value.toLowerCase() as BibliographyEntryType) : "misc";

type EntryFieldRule = {
    needsJournal: boolean;
    needsBooktitle: boolean;
    needsPublisher: boolean;
    urlRecommended: boolean;
};

const ENTRY_FIELD_RULES: Record<BibliographyEntryType, EntryFieldRule> = {
    article: { needsJournal: true, needsBooktitle: false, needsPublisher: false, urlRecommended: false },
    periodical: { needsJournal: true, needsBooktitle: false, needsPublisher: false, urlRecommended: false },
    book: { needsJournal: false, needsBooktitle: false, needsPublisher: true, urlRecommended: false },
    booklet: { needsJournal: false, needsBooktitle: false, needsPublisher: true, urlRecommended: false },
    collection: { needsJournal: false, needsBooktitle: false, needsPublisher: true, urlRecommended: false },
    inbook: { needsJournal: false, needsBooktitle: true, needsPublisher: false, urlRecommended: false },
    incollection: { needsJournal: false, needsBooktitle: true, needsPublisher: false, urlRecommended: false },
    inproceedings: { needsJournal: false, needsBooktitle: true, needsPublisher: false, urlRecommended: false },
    conference: { needsJournal: false, needsBooktitle: true, needsPublisher: false, urlRecommended: false },
    inreference: { needsJournal: false, needsBooktitle: true, needsPublisher: false, urlRecommended: false },
    proceedings: { needsJournal: false, needsBooktitle: false, needsPublisher: true, urlRecommended: false },
    manual: { needsJournal: false, needsBooktitle: false, needsPublisher: true, urlRecommended: false },
    report: { needsJournal: false, needsBooktitle: false, needsPublisher: true, urlRecommended: false },
    techreport: { needsJournal: false, needsBooktitle: false, needsPublisher: true, urlRecommended: false },
    thesis: { needsJournal: false, needsBooktitle: false, needsPublisher: true, urlRecommended: false },
    mastersthesis: { needsJournal: false, needsBooktitle: false, needsPublisher: true, urlRecommended: false },
    phdthesis: { needsJournal: false, needsBooktitle: false, needsPublisher: true, urlRecommended: false },
    online: { needsJournal: false, needsBooktitle: false, needsPublisher: false, urlRecommended: true },
    software: { needsJournal: false, needsBooktitle: false, needsPublisher: false, urlRecommended: true },
    misc: { needsJournal: false, needsBooktitle: false, needsPublisher: false, urlRecommended: false },
    unpublished: { needsJournal: false, needsBooktitle: false, needsPublisher: false, urlRecommended: false },
    reference: { needsJournal: false, needsBooktitle: false, needsPublisher: false, urlRecommended: false },
    patent: { needsJournal: false, needsBooktitle: false, needsPublisher: false, urlRecommended: false },
    dataset: { needsJournal: false, needsBooktitle: false, needsPublisher: false, urlRecommended: false },
};

export const entryFieldRule = (entryType: BibliographyEntryType): EntryFieldRule =>
    ENTRY_FIELD_RULES[entryType];

export const bibliographyEntryTypeLabel = (entryType: BibliographyEntryType): string => {
    switch (entryType) {
        case "article":
            return m.references_type_article();
        case "book":
            return m.references_type_book();
        case "booklet":
            return m.references_type_booklet();
        case "inbook":
            return m.references_type_inbook();
        case "incollection":
            return m.references_type_incollection();
        case "inproceedings":
            return m.references_type_inproceedings();
        case "proceedings":
            return m.references_type_proceedings();
        case "conference":
            return m.references_type_conference();
        case "manual":
            return m.references_type_manual();
        case "misc":
            return m.references_type_misc();
        case "online":
            return m.references_type_online();
        case "patent":
            return m.references_type_patent();
        case "report":
            return m.references_type_report();
        case "techreport":
            return m.references_type_techreport();
        case "thesis":
            return m.references_type_thesis();
        case "mastersthesis":
            return m.references_type_mastersthesis();
        case "phdthesis":
            return m.references_type_phdthesis();
        case "unpublished":
            return m.references_type_unpublished();
        case "software":
            return m.references_type_software();
        case "dataset":
            return m.references_type_dataset();
        case "periodical":
            return m.references_type_periodical();
        case "collection":
            return m.references_type_collection();
        case "reference":
            return m.references_type_reference();
        case "inreference":
            return m.references_type_inreference();
    }
};

export const bibliographyEntryTypeOptions = () =>
    BIBLIOGRAPHY_ENTRY_TYPES.map((value) => ({
        value,
        label: bibliographyEntryTypeLabel(value),
    }));

export type BibliographySecondaryField = "containerTitle" | "publisher" | "none";

export const bibliographySecondaryField = (
    entryType: BibliographyEntryType,
): BibliographySecondaryField => {
    const rule = entryFieldRule(entryType);
    if (rule.needsJournal) {
        return "containerTitle";
    }
    if (rule.needsBooktitle) {
        return "containerTitle";
    }
    if (rule.needsPublisher) {
        return "publisher";
    }
    return "none";
};

export const bibliographySecondaryFieldLabel = (
    entryType: BibliographyEntryType,
): string | null => {
    const rule = entryFieldRule(entryType);
    if (rule.needsJournal) {
        return m.references_journal();
    }
    if (rule.needsBooktitle) {
        return m.references_booktitle();
    }
    if (rule.needsPublisher) {
        return m.references_publisher();
    }
    return null;
};
