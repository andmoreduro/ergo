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

const BARE_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:.-]*/;

/** Unquoted macro names and numbers (`month = jan`, `year = 2020`). */
const readBareValue = (
    text: string,
    start: number,
): { value: string; next: number } | null => {
    const match = text.slice(start).match(BARE_VALUE_PATTERN);
    if (!match) {
        return null;
    }
    return { value: match[0], next: start + match[0].length };
};

const readSingleValue = (
    text: string,
    start: number,
): { value: string; next: number } | null => {
    const ch = text[start];
    if (ch === '"') {
        return readQuotedValue(text, start);
    }
    if (ch === "{") {
        return readBracedValue(text, start);
    }
    return readBareValue(text, start);
};

/** Reads one value, joining `#`-concatenated parts (`{a} # "b"`). */
const readFieldValue = (
    text: string,
    start: number,
): { value: string; next: number } | null => {
    const first = readSingleValue(text, skipWhitespace(text, start));
    if (!first) {
        return null;
    }

    let value = first.value;
    let cursor = first.next;
    for (;;) {
        const separator = skipWhitespace(text, cursor);
        if (text[separator] !== "#") {
            break;
        }
        const part = readSingleValue(text, skipWhitespace(text, separator + 1));
        if (!part) {
            return null;
        }
        value += part.value;
        cursor = part.next;
    }

    return { value, next: cursor };
};

/** Index just past the next comma outside braces, or the end of the text. */
const skipToNextTopLevelComma = (text: string, start: number): number => {
    let depth = 0;
    let cursor = start;
    while (cursor < text.length) {
        const ch = text[cursor] ?? "";
        if (ch === "\\") {
            cursor += 2;
            continue;
        }
        if (ch === "{") {
            depth += 1;
        } else if (ch === "}") {
            depth = Math.max(0, depth - 1);
        } else if (ch === "," && depth === 0) {
            return cursor + 1;
        }
        cursor += 1;
    }
    return text.length;
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
            // Unreadable field: resume at the next one instead of dropping the rest.
            cursor = skipToNextTopLevelComma(body, cursor);
            continue;
        }

        const fieldName = nameMatch[1].toLowerCase();
        const valueStart = cursor + nameMatch[0].length;
        const value = readFieldValue(body, valueStart);
        if (!value) {
            cursor = skipToNextTopLevelComma(body, valueStart);
            continue;
        }

        fields.set(fieldName, value.value);
        cursor = skipWhitespace(body, value.next);
        if (body[cursor] === ",") {
            cursor += 1;
        } else if (cursor < body.length) {
            // Trailing garbage after a value: resume at the next field.
            cursor = skipToNextTopLevelComma(body, cursor);
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
