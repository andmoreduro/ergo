import type { ReferenceEntry } from "../bindings/ReferenceEntry";
import type { FieldImportance } from "../components/atoms/FieldLabel/FieldLabel";
import {
    authorsFromBiblatex,
    authorsToBiblatex,
    emptyReferenceAuthor,
    formatAuthorsForCitation,
    type ReferenceAuthor,
} from "./biblatexAuthors";
import {
    FORM_MANAGED_BIBLATEX_FIELDS,
    referenceFieldsForEntryType,
    type BibliographyValidationCode,
    type ReferenceFieldKey,
} from "./biblatexEntryFields";
import {
    bibliographyEntryTypeOptions,
    normalizeBibliographyEntryType,
    type BibliographyEntryType,
} from "./biblatexEntryTypes";
import { parseBiblatexEntry, serializeBiblatexEntry } from "./biblatexParse";

export type { BibliographyEntryType } from "./biblatexEntryTypes";
export type { ReferenceAuthor } from "./biblatexAuthors";
export {
    bibliographyEntryTypeLabel,
    bibliographyEntryTypeOptions,
} from "./biblatexEntryTypes";
export {
    referenceFieldLabel,
    referenceFieldsForEntryType,
    type ReferenceFieldKey,
} from "./biblatexEntryFields";

export type ReferenceFormFields = Partial<Record<ReferenceFieldKey, string>>;

export interface ReferenceFormValue {
    entryType: BibliographyEntryType;
    authors: ReferenceAuthor[];
    fields: ReferenceFormFields;
    /** BibLaTeX fields not covered by the structured form. */
    extraFields: Record<string, string>;
}

export const emptyReferenceFormValue = (): ReferenceFormValue => ({
    entryType: "article",
    authors: [],
    fields: {},
    extraFields: {},
});

const sanitizeCitationKey = (value: string): string =>
    value.trim().replace(/\s+/g, "-").replace(/[{},\\]/g, "");

const yearFromDateField = (date: string): string => {
    const match = date.trim().match(/^(\d{4})/);
    return match?.[1] ?? "";
};

const updateDateYear = (date: string, year: string): string => {
    const trimmed = date.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return `${year}${trimmed.slice(4)}`;
    }
    if (/^\d{4}/.test(trimmed)) {
        return trimmed.replace(/^\d{4}/, year);
    }
    return year;
};

const fieldValue = (form: ReferenceFormValue, key: ReferenceFieldKey): string =>
    form.fields[key]?.trim() ?? "";

/** BibLaTeX key used in `references.bib` and Typst `@key` citations. Always derived from the entry id. */
export const defaultCitationKey = (id: string): string => {
    const fromId = sanitizeCitationKey(id);
    return fromId.length > 0 ? fromId : "ref";
};

export type { BibliographyValidationCode } from "./biblatexEntryFields";

/** Partial entries are allowed; BibLaTeX serialization never needs blocking validation. */
export const validateReferenceForm = (
    _form: ReferenceFormValue,
): BibliographyValidationCode | null => null;

export const referenceAuthorFieldImportance = (): FieldImportance | undefined =>
    undefined;

export const referenceFormFieldImportance = (
    entryType: BibliographyEntryType,
    field: ReferenceFieldKey,
): FieldImportance | undefined => {
    const spec = referenceFieldsForEntryType(entryType).find(
        (candidate) => candidate.key === field,
    );
    if (!spec || spec.importance !== "required") {
        return undefined;
    }
    return "required";
};

const extraFieldsFromMap = (fields: Map<string, string>): Record<string, string> => {
    const extra: Record<string, string> = {};
    for (const [key, value] of fields) {
        if (!FORM_MANAGED_BIBLATEX_FIELDS.has(key)) {
            extra[key] = value;
        }
    }
    return extra;
};

const fieldsMapFromForm = (form: ReferenceFormValue): Map<string, string> => {
    const fields = new Map<string, string>(Object.entries(form.extraFields));

    for (const key of FORM_MANAGED_BIBLATEX_FIELDS) {
        fields.delete(key);
    }

    const author = authorsToBiblatex(form.authors);
    if (author) {
        fields.set("author", author);
    }

    const year = fieldValue(form, "year");
    const date = fieldValue(form, "date");

    for (const spec of referenceFieldsForEntryType(form.entryType)) {
        const value = fieldValue(form, spec.key);
        if (!value) {
            continue;
        }

        if (spec.key === "year") {
            if (date) {
                fields.set("date", updateDateYear(date, value));
            } else {
                fields.set("year", value);
            }
            continue;
        }

        if (spec.key === "date") {
            fields.set("date", value);
            continue;
        }

        fields.set(spec.key, value);
    }

    if (date && !fields.has("date")) {
        fields.set("date", year ? updateDateYear(date, year) : date);
    }

    return fields;
};

export const referenceFromFormValue = (
    id: string,
    form: ReferenceFormValue,
): ReferenceEntry => {
    const citationKey = defaultCitationKey(id);
    const fields = fieldsMapFromForm(form);

    return {
        id,
        citation_key: citationKey,
        biblatex: serializeBiblatexEntry(form.entryType, citationKey, fields),
    };
};

const formFieldsFromMap = (
    entryType: BibliographyEntryType,
    fields: Map<string, string>,
): ReferenceFormFields => {
    const formFields: ReferenceFormFields = {};
    const specs = referenceFieldsForEntryType(entryType);

    for (const spec of specs) {
        const raw = fields.get(spec.key);
        if (!raw) {
            continue;
        }
        formFields[spec.key] = raw;
    }

    const year =
        fields.get("year") ?? yearFromDateField(fields.get("date") ?? "");
    if (year) {
        formFields.year = year;
    }

    return formFields;
};

export const formValueFromReference = (
    reference: ReferenceEntry,
): ReferenceFormValue => {
    const parsed = parseBiblatexEntry(reference.biblatex);
    if (!parsed) {
        return emptyReferenceFormValue();
    }

    return formValueFromParsedBiblatex(parsed.entryType, parsed.fields);
};

const normalizeImportedBibtexFields = (fields: Map<string, string>): Map<string, string> => {
    const normalized = new Map(fields);

    if (normalized.has("journal") && !normalized.has("journaltitle")) {
        normalized.set("journaltitle", normalized.get("journal") ?? "");
        normalized.delete("journal");
    }

    if (normalized.has("school") && !normalized.has("institution")) {
        normalized.set("institution", normalized.get("school") ?? "");
        normalized.delete("school");
    }

    if (normalized.has("address") && !normalized.has("location")) {
        normalized.set("location", normalized.get("address") ?? "");
        normalized.delete("address");
    }

    return normalized;
};

const formValueFromParsedBiblatex = (
    rawEntryType: string,
    rawFields: Map<string, string>,
): ReferenceFormValue => {
    const fields = normalizeImportedBibtexFields(rawFields);
    const entryType = normalizeBibliographyEntryType(rawEntryType);
    const author = fields.get("author") ?? "";

    return {
        entryType,
        authors: author ? authorsFromBiblatex(author) : [],
        fields: formFieldsFromMap(entryType, fields),
        extraFields: extraFieldsFromMap(fields),
    };
};

/** Converts BibTeX/BibLaTeX returned by the translation server into a form draft. */
export const formValueFromLookupBiblatex = (
    biblatex: string,
): ReferenceFormValue | null => {
    const parsed = parseBiblatexEntry(biblatex.trim());
    if (!parsed) {
        return null;
    }

    return formValueFromParsedBiblatex(parsed.entryType, parsed.fields);
};

const citationContainer = (form: ReferenceFormValue): string =>
    fieldValue(form, "journaltitle") ||
    fieldValue(form, "booktitle") ||
    fieldValue(form, "publisher") ||
    fieldValue(form, "institution") ||
    "";

export const formatReferenceCitation = (reference: ReferenceEntry): string => {
    const form = formValueFromReference(reference);
    const authors = formatAuthorsForCitation(form.authors);
    const year = fieldValue(form, "year");
    const lead = [authors, year ? `(${year})` : ""].filter(Boolean).join(" ");
    const title = fieldValue(form, "title");
    const container = citationContainer(form);

    return [lead, title, container]
        .filter(Boolean)
        .map((part) => (part.endsWith(".") ? part : `${part}.`))
        .join(" ");
};

/** Sort bibliography sidebar entries by localized citation label. */
export const compareBibliographyEntries = (
    left: ReferenceEntry,
    right: ReferenceEntry,
    locale: string,
): number =>
    formatReferenceCitation(left).localeCompare(formatReferenceCitation(right), locale, {
        sensitivity: "base",
    });

export const sortedBibliographyEntryTypeLabels = (
    locale: string,
): Array<{ value: BibliographyEntryType; label: string }> =>
    [...bibliographyEntryTypeOptions()].sort((left, right) =>
        left.label.localeCompare(right.label, locale, { sensitivity: "base" }),
    );

export { emptyReferenceAuthor };
