/** Brace-aware BibLaTeX entry parsing and serialization. */

export type ParsedBiblatexEntry = {
    entryType: string;
    citationKey: string;
    fields: Map<string, string>;
};

const HEADER_PATTERN = /^\s*@([a-zA-Z]+)\s*\{\s*([^,\s]+)\s*,([\s\S]*)\}\s*$/;

const skipWhitespace = (text: string, index: number): number => {
    let cursor = index;
    while (cursor < text.length && /\s/.test(text[cursor] ?? "")) {
        cursor += 1;
    }
    return cursor;
};

const readQuotedValue = (
    text: string,
    start: number,
): { value: string; next: number } | null => {
    if (text[start] !== '"') {
        return null;
    }
    let cursor = start + 1;
    let value = "";
    while (cursor < text.length) {
        const ch = text[cursor] ?? "";
        if (ch === "\\") {
            value += ch;
            cursor += 1;
            if (cursor < text.length) {
                value += text[cursor];
                cursor += 1;
            }
            continue;
        }
        if (ch === '"') {
            return { value, next: cursor + 1 };
        }
        value += ch;
        cursor += 1;
    }
    return null;
};

const readBracedValue = (
    text: string,
    start: number,
): { value: string; next: number } | null => {
    if (text[start] !== "{") {
        return null;
    }
    let depth = 0;
    let cursor = start;
    const valueStart = start + 1;
    while (cursor < text.length) {
        const ch = text[cursor] ?? "";
        if (ch === "\\") {
            cursor += 2;
            continue;
        }
        if (ch === "{") {
            depth += 1;
            cursor += 1;
            continue;
        }
        if (ch === "}") {
            depth -= 1;
            cursor += 1;
            if (depth === 0) {
                return { value: text.slice(valueStart, cursor - 1), next: cursor };
            }
            continue;
        }
        cursor += 1;
    }
    return null;
};

const readFieldValue = (
    text: string,
    start: number,
): { value: string; next: number } | null => {
    const cursor = skipWhitespace(text, start);
    if (cursor >= text.length) {
        return null;
    }
    return text[cursor] === '"'
        ? readQuotedValue(text, cursor)
        : readBracedValue(text, cursor);
};

export const parseBiblatexEntry = (biblatex: string): ParsedBiblatexEntry | null => {
    const trimmed = biblatex.trim();
    const headerMatch = trimmed.match(HEADER_PATTERN);
    if (!headerMatch) {
        return null;
    }

    const entryType = headerMatch[1].toLowerCase();
    const citationKey = headerMatch[2];
    const body = headerMatch[3];
    const fields = new Map<string, string>();

    let cursor = 0;
    while (cursor < body.length) {
        cursor = skipWhitespace(body, cursor);
        if (cursor >= body.length) {
            break;
        }

        const nameMatch = body.slice(cursor).match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*/);
        if (!nameMatch) {
            break;
        }

        const fieldName = nameMatch[1].toLowerCase();
        cursor += nameMatch[0].length;
        const value = readFieldValue(body, cursor);
        if (!value) {
            break;
        }

        fields.set(fieldName, value.value);
        cursor = value.next;

        cursor = skipWhitespace(body, cursor);
        if (body[cursor] === ",") {
            cursor += 1;
        }
    }

    return { entryType, citationKey, fields };
};

export const serializeBiblatexEntry = (
    entryType: string,
    citationKey: string,
    fields: Map<string, string> | Record<string, string>,
): string => {
    const entries =
        fields instanceof Map ? [...fields.entries()] : Object.entries(fields);
    const lines = entries
        .filter(([, value]) => value.trim().length > 0)
        .map(
            ([key, value], index, list) =>
                `  ${key} = {${value}}${
                    index === list.length - 1 ? "" : ","
                }`,
        );

    return `@${entryType}{${citationKey},\n${lines.join("\n")}\n}`;
};
