/**
 * Normalization applied to BibLaTeX returned by the Zotero translation server
 * before it becomes a form draft. Stored entries and manual edits are never
 * rewritten: the decoding happens only at the lookup boundary.
 */

const CONTROL_WORD_REPLACEMENTS: Record<string, string> = {
    textasciitilde: "~",
    textbackslash: "\\",
    textbar: "|",
    textless: "<",
    textgreater: ">",
    textasciicircum: "^",
};

// Alternatives in priority order: the brace escapes Zotero emits for literal
// `{` / `}`, then `{\word}` / `\word{}` / `\word`, then single-character escapes.
// Plain braces are left alone (math and case protection).
const LATEX_ESCAPE_PATTERN =
    /\\\{\\vphantom\{\\\}\}|\\vphantom\{\\\{\}\\\}|\{\\(textasciitilde|textbackslash|textbar|textless|textgreater|textasciicircum)\}|\\(textasciitilde|textbackslash|textbar|textless|textgreater|textasciicircum)(?:\{\})?|\\([&%_#$}{])/g;

/** Decodes LaTeX escapes (`\&`, `\%`, `\textasciitilde`, …) into plain text. */
export const unescapeLatexText = (value: string): string =>
    value.replace(
        LATEX_ESCAPE_PATTERN,
        (match: string, bracedWord?: string, word?: string, char?: string) => {
            const controlWord = bracedWord ?? word;
            if (controlWord) {
                return CONTROL_WORD_REPLACEMENTS[controlWord] ?? match;
            }
            if (char) {
                return char;
            }
            return match.startsWith("\\{") ? "{" : "}";
        },
    );

/** Fields Zotero exports that only make sense inside a Zotero library. */
const DROPPED_LOOKUP_FIELDS = new Set(["file"]);

/** Drops library-local fields and decodes LaTeX escapes in the remaining values. */
export const sanitizeLookupFields = (
    fields: Map<string, string>,
): Map<string, string> => {
    const sanitized = new Map<string, string>();
    for (const [key, value] of fields) {
        if (DROPPED_LOOKUP_FIELDS.has(key)) {
            continue;
        }
        sanitized.set(key, unescapeLatexText(value));
    }
    return sanitized;
};
