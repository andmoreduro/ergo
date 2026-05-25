import type { ReferenceEntry } from "../bindings/ReferenceEntry";
import type { FieldImportance } from "../components/atoms/FieldLabel/FieldLabel";
import {
    bibliographySecondaryField,
    entryFieldRule,
    normalizeBibliographyEntryType,
    type BibliographyEntryType,
} from "./biblatexEntryTypes";

export type { BibliographyEntryType } from "./biblatexEntryTypes";
export {
    bibliographyEntryTypeLabel,
    bibliographyEntryTypeOptions,
    bibliographySecondaryField,
    bibliographySecondaryFieldLabel,
} from "./biblatexEntryTypes";

export interface ReferenceFormValue {
    entryType: BibliographyEntryType;
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
    "booktitle",
    "publisher",
    "doi",
    "url",
    "institution",
] as const;

const sanitizeCitationKey = (value: string): string =>
    value.trim().replace(/\s+/g, "-").replace(/[{},\\]/g, "");

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

const authorFamilyName = (author: string): string => {
    const trimmed = author.trim();
    if (!trimmed) {
        return "";
    }

    if (trimmed.includes(",")) {
        return trimmed.split(",")[0].trim();
    }

    const parts = trimmed.split(/\s+/);
    return parts[parts.length - 1] ?? "";
};

/** BibLaTeX key used in `references.bib` and Typst `@key` citations. Always derived from the entry id. */
export const defaultCitationKey = (id: string): string => {
    const fromId = sanitizeCitationKey(id);
    return fromId.length > 0 ? fromId : "ref";
};

export type BibliographyValidationCode =
    | "title"
    | "authors"
    | "year"
    | "journal"
    | "booktitle"
    | "publisher";

/** Minimum fields Typst/biblatex need for a resolvable citation. */
export const validateReferenceForm = (
    form: ReferenceFormValue,
): BibliographyValidationCode | null => {
    if (!form.title.trim()) {
        return "title";
    }
    if (!form.authors.trim()) {
        return "authors";
    }
    if (!form.year.trim()) {
        return "year";
    }

    const rule = entryFieldRule(form.entryType);
    if (rule.needsJournal && !form.containerTitle.trim()) {
        return "journal";
    }
    if (rule.needsBooktitle && !form.containerTitle.trim()) {
        return "booktitle";
    }
    if (rule.needsPublisher && !form.publisher.trim()) {
        return "publisher";
    }

    return null;
};

export const bibliographyFieldImportance = (
    form: ReferenceFormValue,
    field: keyof ReferenceFormValue,
): FieldImportance | undefined => {
    if (field === "entryType") {
        return "required";
    }
    if (field === "title" || field === "authors" || field === "year") {
        return "required";
    }

    const rule = entryFieldRule(form.entryType);
    if (field === "containerTitle") {
        if (rule.needsJournal || rule.needsBooktitle) {
            return "required";
        }
        return undefined;
    }
    if (field === "publisher" && rule.needsPublisher) {
        return "required";
    }
    if (field === "url" && rule.urlRecommended) {
        return "recommended";
    }
    if (field === "doi" || field === "url") {
        return "optional";
    }
    return undefined;
};

const readEntryHeader = (biblatex: string): BibliographyEntryType | null => {
    const match = biblatex.match(/^\s*@([a-zA-Z]+)\s*\{\s*([^,\s]+)\s*,/);
    if (!match) {
        return null;
    }

    return normalizeBibliographyEntryType(match[1]);
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

const biblatexFieldsFromForm = (form: ReferenceFormValue): Array<[string, string]> => {
    const rule = entryFieldRule(form.entryType);
    const fields: Array<[string, string]> = [
        ["author", authorsToBiblatex(form.authors)],
        ["title", form.title.trim()],
        ["year", form.year.trim()],
    ];

    if (rule.needsJournal) {
        fields.push(["journaltitle", form.containerTitle.trim()]);
    } else if (rule.needsBooktitle) {
        fields.push(["booktitle", form.containerTitle.trim()]);
    } else if (rule.needsPublisher) {
        fields.push(["publisher", form.publisher.trim()]);
    }

    if (form.doi.trim()) {
        fields.push(["doi", form.doi.trim()]);
    }
    if (form.url.trim()) {
        fields.push(["url", form.url.trim()]);
    }

    return fields.filter(([, value]) => value.length > 0);
};

export const referenceFromFormValue = (
    id: string,
    form: ReferenceFormValue,
): ReferenceEntry => {
    const citationKey = defaultCitationKey(id);
    const fields = biblatexFieldsFromForm(form);

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
    const entryType = readEntryHeader(reference.biblatex) ?? "misc";
    const fields = readBiblatexFields(reference.biblatex);
    const secondary = bibliographySecondaryField(entryType);

    return {
        entryType,
        title: fields.title ?? "",
        authors: fields.author ? authorsFromBiblatex(fields.author) : "",
        year: fields.year ?? "",
        containerTitle:
            secondary === "containerTitle"
                ? (fields.journaltitle ?? fields.booktitle ?? "")
                : "",
        publisher: fields.publisher ?? "",
        doi: fields.doi ?? "",
        url: fields.url ?? "",
    };
};

export const formatReferenceCitation = (reference: ReferenceEntry): string => {
    const form = formValueFromReference(reference);
    const authors = form.authors
        .split(/\r?\n/)
        .map(authorFamilyName)
        .filter(Boolean)
        .join("; ");
    const lead = [authors, form.year ? `(${form.year})` : ""]
        .filter(Boolean)
        .join(" ");
    const title = form.title.trim();
    const rule = entryFieldRule(form.entryType);
    const container = rule.needsJournal || rule.needsBooktitle
        ? form.containerTitle.trim()
        : rule.needsPublisher
          ? form.publisher.trim()
          : "";

    return [lead, title, container]
        .filter(Boolean)
        .map((part) => (part.endsWith(".") ? part : `${part}.`))
        .join(" ");
};
