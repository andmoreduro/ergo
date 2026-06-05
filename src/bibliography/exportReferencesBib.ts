import type { ReferenceEntry } from "../bindings/ReferenceEntry";

/** Join reference entries into a BibLaTeX file (mirrors backend `generate_references_bib`). */
export const exportReferencesBib = (references: ReferenceEntry[]): string => {
    const blocks = references
        .map((reference) => reference.biblatex.trim())
        .filter((biblatex) => biblatex.length > 0);
    if (blocks.length === 0) {
        return "";
    }
    let source = blocks.join("\n\n");
    if (!source.endsWith("\n")) {
        source += "\n";
    }
    return source;
};
