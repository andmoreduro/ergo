import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentElement } from "../bindings/DocumentElement";
import type { RichText } from "../bindings/RichText";
import { DEFAULT_PROJECT_SETTINGS } from "../settings/defaults";

export interface SourceMapEntry {
    elementId: string;
    label: string;
    start: number;
    end: number;
}

export interface GeneratedTypstDocument {
    source: string;
    sourceMap: SourceMapEntry[];
}

export const escapeTypstText = (value: string): string =>
    value.replace(/[\\#\$%&_^\{\}\[\]]/g, (character) => `\\${character}`);

const escapeTypstString = (value: string): string =>
    value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");

export const labelForId = (id: string): string => {
    const normalized = id
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

    return normalized ? `ergo-${normalized}` : "ergo-element";
};

const richTextToTypst = (content: RichText[]): string =>
    content
        .map((span) => {
            if (span.kind === "reference" && span.reference_id) {
                return `@${labelForId(span.reference_id)}`;
            }

            if (span.kind === "inlineEquation" && span.equation_source) {
                const source = normalizeMathSource(span.equation_source);
                return source ? `$${source}$` : "";
            }

            const text = escapeTypstText(span.text);

            if (span.bold && span.italic) {
                return `*_${text}_*`;
            }

            if (span.bold) {
                return `*${text}*`;
            }

            if (span.italic) {
                return `_${text}_`;
            }

            return text;
        })
        .join("");

const sanitizeTableColumnSize = (value: string): string => {
    const trimmed = value.trim();
    if (/^(auto|(?:\d+(?:\.\d+)?)(?:fr|pt|mm|cm|in|em|%))$/.test(trimmed)) {
        return trimmed;
    }

    return "1fr";
};

const sanitizePlacement = (value: string): string => {
    if (value === "top" || value === "bottom") {
        return value;
    }

    return "auto";
};

const normalizeMathSource = (value: string): string =>
    value.trim().replace(/^\$+|\$+$/g, "").trim();

const generatePreambleTypst = (ast: DocumentAST): string => {
    const settings = {
        ...DEFAULT_PROJECT_SETTINGS,
        ...ast.metadata.project_settings,
    };
    const paperSize = settings.paper_size ?? DEFAULT_PROJECT_SETTINGS.paper_size;
    const textFont = settings.text_font ?? DEFAULT_PROJECT_SETTINGS.text_font;
    const fontSize = settings.font_size ?? DEFAULT_PROJECT_SETTINGS.font_size;

    return `#set page(paper: "${escapeTypstString(paperSize ?? "us-letter")}")
#set text(font: "${escapeTypstString(textFont ?? "Libertinus Serif")}", size: ${fontSize ?? 11}pt)

`;
};

const paragraphBody = (element: Extract<DocumentElement, { type: "Paragraph" }>) =>
    richTextToTypst(element.content);

const generateElementTypst = (element: DocumentElement): string => {
    const label = `<${labelForId(element.id)}>`;

    if (element.type === "Heading") {
        const level = Math.min(Math.max(Math.round(element.level), 1), 5);
        const marker = "=".repeat(level);
        const title = richTextToTypst(element.content).trim() || "Untitled heading";

        return `${marker} ${title} ${label}\n\n`;
    }

    if (element.type === "Paragraph") {
        const body = paragraphBody(element).trim();
        return body ? `${body} ${label}\n\n` : "";
    }

    if (element.type === "Equation") {
        const source = normalizeMathSource(element.latex_source);
        if (!source) {
            return "";
        }

        return element.is_block
            ? `$ ${source} $ ${label}\n\n`
            : `$${source}$ ${label}\n\n`;
    }

    if (element.type === "Table") {
        const columns = element.column_sizes
            .map(sanitizeTableColumnSize)
            .join(", ");
        const cells = element.cells
            .flatMap((row) =>
                row.map((cell) => `[${escapeTypstText(cell.content)}]`),
            )
            .join(",\n  ");

        return `#table(
  columns: (${columns}),
  ${cells}
) ${label}

`;
    }

    const body =
        element.content.type === "Paragraph"
            ? paragraphBody(element.content).trim()
            : "";
    const caption = escapeTypstText(element.caption.trim());
    const placement = sanitizePlacement(element.placement);
    const assetPath = element.asset_id ? `assets/${labelForId(element.asset_id)}` : null;

    if (!body && !caption && !assetPath) {
        return "";
    }

    const captionLine = caption ? `,\n  caption: [${caption}]` : "";
    const figureBody = assetPath
        ? `#image("${escapeTypstString(assetPath)}")`
        : body || "Figure content";

    return `#figure(
  [${figureBody}]${captionLine},
  placement: ${placement}
) ${label}

`;
};

const generateCoverPageTypst = (ast: DocumentAST): string => {
    const coverPage = ast.sections.find((section) => section.type === "CoverPage");
    const title = escapeTypstText(ast.metadata.title.trim() || "Untitled Document");

    if (!coverPage || coverPage.type !== "CoverPage") {
        return `#align(center)[#text(size: 18pt, weight: "bold")[${title}]]\n\n`;
    }

    const authors = coverPage.authors
        .map((author) => {
            const email = author.email ? ` (${author.email})` : "";
            return escapeTypstText(`${author.name}${email}`.trim());
        })
        .filter(Boolean);
    const affiliations = coverPage.affiliations.map(escapeTypstText);
    const abstractText = escapeTypstText(coverPage.abstract_text.trim());

    const lines = [
        `#text(size: 18pt, weight: "bold")[${title}]`,
        ...authors,
        ...affiliations,
    ].filter(Boolean);

    const abstractBlock = abstractText
        ? `#block[
  #strong[Abstract]

  ${abstractText}
]

`
        : "";

    return `#align(center)[
  ${lines.join("\n\n  ")}
]

${abstractBlock}`;
};

const generateReferencesTypst = (ast: DocumentAST): string => {
    if (!ast.references.length) {
        return "";
    }

    const items = ast.references
        .map(
            (reference) =>
                `- <${labelForId(reference.id)}> ${escapeTypstText(reference.citation_key)}`,
        )
        .join("\n");

    return `= References\n\n${items}\n\n`;
};

export function generateTypstWithSourceMap(
    ast: DocumentAST,
): GeneratedTypstDocument {
    const prefix = `${generatePreambleTypst(ast)}${generateCoverPageTypst(ast)}`;
    const sourceMap: SourceMapEntry[] = [];
    let source = prefix;

    ast.sections
        .filter((section) => section.type === "Content")
        .flatMap((section) => (section.type === "Content" ? section.elements : []))
        .forEach((element) => {
            const elementSource = generateElementTypst(element);
            const start = source.length;
            source += elementSource;

            if (elementSource) {
                sourceMap.push({
                    elementId: element.id,
                    label: labelForId(element.id),
                    start,
                    end: source.length,
                });
            }
        });

    source += generateReferencesTypst(ast);

    return { source, sourceMap };
}

export function generateTypst(ast: DocumentAST): string {
    return generateTypstWithSourceMap(ast).source;
}
