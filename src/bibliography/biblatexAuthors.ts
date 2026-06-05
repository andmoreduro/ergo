export interface ReferenceAuthor {
    givenInitial: string;
    given: string;
    family: string;
    prefix: string;
    suffix: string;
}

export const emptyReferenceAuthor = (): ReferenceAuthor => ({
    givenInitial: "",
    given: "",
    family: "",
    prefix: "",
    suffix: "",
});

export const authorHasContent = (author: ReferenceAuthor): boolean =>
    Boolean(
        author.givenInitial.trim() ||
            author.given.trim() ||
            author.family.trim() ||
            author.prefix.trim() ||
            author.suffix.trim(),
    );

export const hasValidAuthors = (authors: ReferenceAuthor[]): boolean =>
    authors.some(
        (author) => author.family.trim().length > 0 || author.given.trim().length > 0,
    );

const looksLikeBiblatexNames = (value: string): boolean =>
    /\b(family|given|given-i|prefix|suffix)\s*=/i.test(value);

const wrapBiblatexNameValue = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) {
        return "";
    }
    if (/[\s,{}]/.test(trimmed)) {
        return `{${trimmed}}`;
    }
    return trimmed;
};

const structuredAuthorToBiblatexPart = (author: ReferenceAuthor): string => {
    const parts: string[] = [];
    if (author.givenInitial.trim()) {
        parts.push(`given-i=${author.givenInitial.trim()}`);
    }
    if (author.given.trim()) {
        parts.push(`given=${wrapBiblatexNameValue(author.given)}`);
    }
    if (author.prefix.trim()) {
        parts.push(`prefix=${wrapBiblatexNameValue(author.prefix)}`);
    }
    if (author.family.trim()) {
        parts.push(`family=${wrapBiblatexNameValue(author.family)}`);
    }
    if (author.suffix.trim()) {
        parts.push(`suffix=${wrapBiblatexNameValue(author.suffix)}`);
    }
    return parts.join(", ");
};

/** Simple "Given Family" strings cannot round-trip multi-word name parts. */
const needsStructuredAuthorName = (author: ReferenceAuthor): boolean => {
    if (author.givenInitial.trim() || author.prefix.trim() || author.suffix.trim()) {
        return true;
    }
    const given = author.given.trim();
    const family = author.family.trim();
    return /\s/.test(given) || /\s/.test(family);
};

export const authorToBiblatexPart = (author: ReferenceAuthor): string => {
    if (needsStructuredAuthorName(author)) {
        return structuredAuthorToBiblatexPart(author);
    }

    const given = author.given.trim();
    const family = author.family.trim();
    if (given && family) {
        return `${given} ${family}`;
    }
    return family || given;
};

export const authorsToBiblatex = (authors: ReferenceAuthor[]): string =>
    authors
        .filter(authorHasContent)
        .map(authorToBiblatexPart)
        .filter(Boolean)
        .join(" and ");

const splitNameList = (value: string): string[] => {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;

    for (let index = 0; index < value.length; index += 1) {
        const ch = value[index] ?? "";
        if (ch === "{") {
            depth += 1;
        } else if (ch === "}") {
            depth -= 1;
        } else if (depth === 0 && value.slice(index).match(/^\s+and\s+/)) {
            parts.push(value.slice(start, index).trim());
            const match = value.slice(index).match(/^\s+and\s+/);
            index += (match?.[0].length ?? 1) - 1;
            start = index + 1;
        }
    }

    parts.push(value.slice(start).trim());
    return parts.filter(Boolean);
};

const parseSimpleAuthor = (value: string): ReferenceAuthor => {
    const trimmed = value.trim();
    if (!trimmed) {
        return emptyReferenceAuthor();
    }

    if (trimmed.includes(",")) {
        const [family, given] = trimmed.split(",", 2);
        return {
            ...emptyReferenceAuthor(),
            family: family.trim(),
            given: given.trim(),
        };
    }

    const tokens = trimmed.split(/\s+/);
    if (tokens.length === 1) {
        return { ...emptyReferenceAuthor(), family: tokens[0] ?? "" };
    }

    return {
        ...emptyReferenceAuthor(),
        family: tokens[tokens.length - 1] ?? "",
        given: tokens.slice(0, -1).join(" "),
    };
};

const parseStructuredAuthorPart = (part: string): ReferenceAuthor => {
    const author = emptyReferenceAuthor();
    const pattern =
        /\b(given-i|given|family|prefix|suffix)\s*=\s*(\{([^}]*)\}|([^,]+))/gi;

    for (const match of part.matchAll(pattern)) {
        const key = match[1].toLowerCase();
        const value = (match[3] ?? match[4] ?? "").trim();
        switch (key) {
            case "given-i":
                author.givenInitial = value;
                break;
            case "given":
                author.given = value;
                break;
            case "family":
                author.family = value;
                break;
            case "prefix":
                author.prefix = value;
                break;
            case "suffix":
                author.suffix = value;
                break;
            default:
                break;
        }
    }

    return author;
};

export const parseAuthorPart = (part: string): ReferenceAuthor =>
    looksLikeBiblatexNames(part) ? parseStructuredAuthorPart(part) : parseSimpleAuthor(part);

export const authorsFromBiblatex = (value: string): ReferenceAuthor[] => {
    const trimmed = value.trim();
    if (!trimmed) {
        return [];
    }
    return splitNameList(trimmed).map(parseAuthorPart);
};

export const formatAuthorsForCitation = (authors: ReferenceAuthor[]): string =>
    authors
        .filter(authorHasContent)
        .map((author) => author.family.trim() || author.given.trim())
        .filter(Boolean)
        .join("; ");
