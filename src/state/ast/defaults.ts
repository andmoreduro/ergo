import type { ContentSection } from "../../bindings/ContentSection";
import type { CoverPageSection } from "../../bindings/CoverPageSection";
import type { DocumentAST } from "../../bindings/DocumentAST";
import type { DocumentElement } from "../../bindings/DocumentElement";
import type { RichText } from "../../bindings/RichText";
import type { TableCell } from "../../bindings/TableCell";

let fallbackIdCounter = 0;

export const createId = (): string => {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    fallbackIdCounter += 1;
    return `local-${Date.now()}-${fallbackIdCounter}`;
};

export const createRichText = (text = ""): RichText => ({
    text,
    bold: null,
    italic: null,
    kind: null,
    reference_id: null,
    equation_source: null,
});

export const createHeading = (
    level = 1,
    text = "",
    id = createId(),
): DocumentElement => ({
    type: "Heading",
    id,
    level,
    content: text ? [createRichText(text)] : [],
});

export const createParagraph = (
    text = "",
    id = createId(),
): DocumentElement => ({
    type: "Paragraph",
    id,
    content: text ? [createRichText(text)] : [],
});

const createEmptyCell = (): TableCell => ({
    content: "",
    row_span: null,
    col_span: null,
});

export const createTable = (
    rows = 2,
    cols = 2,
    id = createId(),
): DocumentElement => ({
    type: "Table",
    id,
    rows,
    cols,
    cells: Array.from({ length: rows }, () =>
        Array.from({ length: cols }, createEmptyCell),
    ),
    column_sizes: Array.from({ length: cols }, () => "1fr"),
});

export const createEquation = (
    id = createId(),
    latexSource = "",
): DocumentElement => ({
    type: "Equation",
    id,
    latex_source: latexSource,
    is_block: true,
});

export const createFigure = (id = createId()): DocumentElement => ({
    type: "Figure",
    id,
    asset_id: null,
    content: createParagraph(""),
    caption: "",
    placement: "auto",
});

export const createContentSection = (id = createId()): ContentSection => ({
    id,
    is_optional: false,
    elements: [],
});

export const createCoverPageSection = (id = createId()): CoverPageSection => ({
    id,
    is_optional: true,
    authors: [],
    affiliations: [],
    abstract_text: "",
});

export const createDefaultDocumentAST = (): DocumentAST => ({
    version: "1.0",
    metadata: {
        template_id: "apa7",
        title: "Untitled Document",
        project_settings: {
            paper_size: "us-letter",
            language: "en",
            text_font: "Libertinus Serif",
            math_font: "Libertinus Math",
            raw_font: "DejaVu Sans Mono",
            font_size: 11,
            table_stroke_width: 0.5,
            template_overrides: [],
        },
        local_overrides: {
            default_font: null,
            default_font_size: null,
            theme_mode: "system",
            locale: "en",
            recent_projects: [],
            keymap_profile: "Default",
            keymap_overrides: [],
            preview_debounce_ms: 300,
            history_limit: 100,
        },
    },
    dependencies: {
        packages: [
            {
                name: "@preview/versatile-apa",
                version: "7.2.0",
            },
        ],
    },
    references: [],
    assets: [],
    sections: [
        {
            type: "CoverPage",
            ...createCoverPageSection(),
        },
        {
            type: "Content",
            ...createContentSection(),
        },
    ],
});
