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
    extra_fields: {},
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
    extra_fields: {},
});

export const createContentSection = (id = createId()): ContentSection => ({
    id,
    is_optional: false,
    elements: [],
});

export const DEFAULT_PROJECT_TEMPLATE_ID = "versatile-apa";
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
                    preview_zoom_render_debounce_ms: 120,
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

    return createDefaultDocumentAST();
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
            preview_zoom_render_debounce_ms: 120,
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
