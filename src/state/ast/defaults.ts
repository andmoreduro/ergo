import { plainTemplateOutlineDisabledOverrides } from "../../settings/templateOverrides";
import type { ContentSection } from "../../bindings/ContentSection";
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
    underline: null,
    kind: null,
    reference_id: null,
    equation_source: null,
    equation_syntax: "typst",
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

export const createQuote = (
    text = "",
    id = createId(),
): DocumentElement => ({
    type: "Quote",
    id,
    content: text ? [createRichText(text)] : [],
});

export const createList = (
    id = createId(),
): DocumentElement => ({
    type: "List",
    id,
    items: [[createRichText("")]],
});

export const createEnumeration = (
    id = createId(),
): DocumentElement => ({
    type: "Enumeration",
    id,
    items: [[createRichText("")]],
});

export const createEmptyCell = (): TableCell => ({
    elements: [createParagraph()],
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
    extra_fields: { placement: "here" },
});

export const createEquation = (
    id = createId(),
    latexSource = "",
    syntax: "typst" | "latex" = "typst",
): DocumentElement => ({
    type: "Equation",
    id,
    latex_source: latexSource,
    is_block: true,
    syntax,
});

export const createFigure = (id = createId()): DocumentElement => ({
    type: "Figure",
    id,
    asset_id: null,
    content: createParagraph(""),
    caption: "",
    placement: "here",
    extra_fields: {},
});

export const createDiagram = (id = `diagram-${createId()}`): DocumentElement => ({
    type: "Diagram",
    id,
    mermaid_source: "flowchart TD\n  A[Start] --> B[End]",
    asset_id: null,
    caption: "",
    placement: "here",
    extra_fields: {},
});

export const createContentSection = (id = createId()): ContentSection => ({
    id,
    is_optional: false,
    elements: [],
});

export const DEFAULT_PROJECT_TEMPLATE_ID = "apa7";
export const UMB_APA_TEMPLATE_ID = "umb-apa";
export const NO_TEMPLATE_ID = "none";

export const createDocumentAST = (
    templateId: string = DEFAULT_PROJECT_TEMPLATE_ID,
): DocumentAST => {
    if (templateId === NO_TEMPLATE_ID) {
        return {
            version: "1.0",
            metadata: {
                template_id: NO_TEMPLATE_ID,
                template_variant_id: null,
                title: "Untitled Document",
                running_head: null,
                keywords: [],
                project_settings: {
                    paper_size: "us-letter",
                    language: "en",
                    text_font: "Libertinus Serif",
                    math_font: "Libertinus Math",
                    raw_font: "DejaVu Sans Mono",
                    font_size: 11,
                    table_stroke_width: 0.5,
                    template_overrides: plainTemplateOutlineDisabledOverrides(),
                },
                local_overrides: {
                    default_font: null,
                    default_font_size: null,
                    theme_mode: "system",
                    locale: "en",
                    recent_projects: [],
                    keymap_profile: "Default",
                    keymap_overrides: [],
                    history_limit: 100,
                    autosave_enabled: true,
                    autosave_interval_ms: 30_000,
                    autosave_on_window_blur: true,
                    autosave_on_app_close: true,
                    autosave_on_project_close: true,
                    default_equation_syntax: "typst",
                },
            },
            dependencies: { packages: [] },
            references: [],
            assets: [],
            inputs: {
                title: "Untitled Document",
            },
            sections: [
                {
                    type: "Content",
                    ...createContentSection(),
                },
            ],
        };
    }

    if (templateId === "umb-apa") {
        const ast = createDefaultDocumentAST();
        ast.metadata.template_id = "umb-apa";
        ast.metadata.template_variant_id = null;
        ast.dependencies = { packages: [] };
        ast.inputs = {
            title: "Untitled Document",
            running_head: "",
            authors: [{ name: "", affiliations: [] }],
            affiliations: [],
            author_note: "",
            director: {
                name: "",
                title: "",
            },
            degree: "",
            city: "",
            year: new Date().getFullYear().toString(),
            authorities: [],
            acknowledgements: "",
            abstract_es: "",
            keywords_es: [],
            abstract_en: "",
            keywords_en: [],
        };
        return ast;
    }
    const ast = createDefaultDocumentAST();
    return ast;
};

export const createDefaultDocumentAST = (): DocumentAST => ({
    version: "1.0",
    metadata: {
        template_id: DEFAULT_PROJECT_TEMPLATE_ID,
        template_variant_id: "student",
        title: "Untitled Document",
        running_head: null,
        keywords: [],
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
            history_limit: 100,
            autosave_enabled: true,
            autosave_interval_ms: 30_000,
            autosave_on_window_blur: true,
            autosave_on_app_close: true,
            autosave_on_project_close: true,
            default_equation_syntax: "typst",
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
    inputs: {
        title: "Untitled Document",
        running_head: "",
        abstract_text: "",
        affiliations: [],
        authors: [{ name: "", affiliations: [] }],
        course: "",
        due_date: "",
        instructor: "",
        author_note: "",
        keywords: [],
    },
    sections: [
        {
            type: "Content",
            ...createContentSection(),
        },
    ],
});
