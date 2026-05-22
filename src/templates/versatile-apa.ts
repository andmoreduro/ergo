import type { TemplateSpec } from "./types";

export const VERSATILE_APA_TEMPLATE: TemplateSpec = {
    template: {
        id: "versatile-apa",
        name: "APA 7th Edition",
        version: "1.0.0",
        description: "American Psychological Association 7th Edition formatting via the versatile-apa Typst package.",
    },
    package: {
        name: "@preview/versatile-apa",
        version: "7.2.0",
        imports: [
            "abstract-page",
            "appendix",
            "appendix-outline",
            "title-page",
            "apa-figure",
            { symbol: "versatile-apa", alias: "apa-style" },
        ],
    },
    show_rule: {
        function: "apa-style",
        params: [
            {
                key: "font-size",
                type: "length",
                source: "settings.font_size",
                default: "12pt",
            },
            {
                key: "running-head",
                type: "content",
                source: "metadata.title",
            },
        ],
    },
    inputs: [
        {
            id: "title",
            type: "string",
            label: "Title",
            default: "Untitled Document",
            importance: "required",
        },
        {
            id: "running_head",
            type: "string",
            label: "Running Head",
            importance: "recommended",
        },
        {
            id: "abstract_text",
            type: "string",
            label: "Abstract",
            importance: "recommended",
        },
        {
            id: "keywords",
            type: "array",
            items: { type: "string" },
            label: "Keywords",
            importance: "optional",
        },
        {
            id: "authors",
            type: "array",
            label: "Authors",
            importance: "required",
            items: {
                type: "object",
                properties: [
                    { id: "name", type: "string", label: "Name", importance: "required" },
                    { id: "affiliations", type: "array", items: { type: "string" }, label: "Affiliations", importance: "optional" },
                ],
            },
        },
        {
            id: "affiliations",
            type: "array",
            label: "Affiliations",
            importance: "recommended",
            items: {
                type: "string",
                label: "Affiliation Name",
                importance: "recommended"
            },
        },
        {
            id: "course",
            type: "string",
            label: "Course",
            importance: "optional",
        },
        {
            id: "instructor",
            type: "string",
            label: "Instructor",
            importance: "optional",
        },
        {
            id: "due_date",
            type: "string",
            label: "Due Date",
            importance: "optional",
        },
        {
            id: "author_note",
            type: "string",
            label: "Author Note",
            importance: "optional",
        },
    ],
    groups: [
        {
            id: "cover_page",
            label: "Cover Page",
            inputs: ["title", "running_head", "authors", "affiliations", "course", "instructor", "due_date", "author_note"],
        },
        {
            id: "abstract",
            label: "Abstract",
            inputs: ["abstract_text", "keywords"],
        },
    ],
    resource_policy: {
        preview: {
            width_pt: 360,
            margin_pt: 8,
        },
        pasted_image: {
            behavior: "figure",
            wrapper: "apa-figure",
        },
    },
    sections: [
        {
            id: "title-page",
            kind: "function_call",
            function: "title-page",
            label: "Title Page",
            params: [
                {
                    key: "authors",
                    type: "author_list",
                    source: "cover_page.authors",
                },
                {
                    key: "affiliations",
                    type: "affiliation_map",
                    source: "cover_page.affiliations",
                },
                {
                    key: "course",
                    type: "content",
                    source: "cover_page.course",
                },
                {
                    key: "instructor",
                    type: "content",
                    source: "cover_page.instructor",
                },
                {
                    key: "due-date",
                    type: "content",
                    source: "cover_page.due_date",
                },
                {
                    key: "author-note",
                    type: "content",
                    source: "cover_page.author_note",
                },
            ],
        },
        {
            id: "abstract-page",
            kind: "function_call",
            function: "abstract-page",
            label: "Abstract",
            params: [
                {
                    key: "_positional",
                    type: "content",
                    source: "cover_page.abstract_text",
                },
                {
                    key: "keywords",
                    type: "string_array",
                    source: "metadata.keywords",
                },
            ],
        },
        {
            id: "body",
            kind: "content",
            label: "Body",
        },
        {
            id: "references",
            kind: "bibliography",
            label: "References",
            file: "references.bib",
            title: "References",
            pagebreak_before: true,
        },
        {
            id: "appendices",
            kind: "appendix",
            label: "Appendices",
            show_rule: "appendix",
        },
    ],
    element_overrides: {
        figure: {
            function: "apa-figure",
            extra_fields: [
                {
                    key: "note",
                    type: "content",
                    label: "General Note",
                },
                {
                    key: "specific-note",
                    type: "content",
                    label: "Specific Note",
                },
                {
                    key: "probability-note",
                    type: "content",
                    label: "Probability Note",
                },
            ],
        },
        table: {
            wrapper: "apa-figure",
            extra_fields: [
                {
                    key: "note",
                    type: "content",
                    label: "General Note",
                },
                {
                    key: "specific-note",
                    type: "content",
                    label: "Specific Note",
                },
                {
                    key: "probability-note",
                    type: "content",
                    label: "Probability Note",
                },
            ],
        },
    },
    defaults: {
        paper_size: "us-letter",
        language: "en",
        text_font: "Libertinus Serif",
        math_font: "Libertinus Math",
        raw_font: "DejaVu Sans Mono",
        font_size: 12.0,
        table_stroke_width: 0.5,
    },
};
