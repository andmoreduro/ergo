import type { Command } from "./types";
import { m } from "../paraglide/messages.js";

export type ElementType =
    | "heading"
    | "paragraph"
    | "table"
    | "equation"
    | "inlineEquation"
    | "quote"
    | "diagram"
    | "list"
    | "enumeration"
    | "figure";

export type InsertElementOptions = {
    headingLevel?: number;
};

export interface EditorCommandDeps {
    insertElement: (elementType: ElementType, options?: InsertElementOptions) => void;
    applyRichTextMark: (mark: "bold" | "italic" | "underline") => void;
}

export const editorCommands = (deps: EditorCommandDeps): Command[] => [
    {
        id: "editor::InsertParagraph",
        label: m.menubar_insert_paragraph(),
        scope: "editor",
        run: () => deps.insertElement("paragraph"),
    },
    {
        id: "editor::InsertHeading",
        label: m.menubar_insert_heading(),
        scope: "editor",
        run: () => deps.insertElement("heading"),
    },
    {
        id: "editor::InsertTable",
        label: m.menubar_insert_table(),
        scope: "editor",
        run: () => deps.insertElement("table"),
    },
    {
        id: "editor::InsertEquation",
        label: m.menubar_insert_equation(),
        scope: "editor",
        run: () => deps.insertElement("equation"),
    },
    {
        id: "editor::InsertBlockEquation",
        label: m.menubar_insert_block_equation(),
        scope: "editor",
        run: () => deps.insertElement("equation"),
    },
    {
        id: "editor::InsertInlineEquation",
        label: m.menubar_insert_inline_equation(),
        scope: "editor",
        run: () => deps.insertElement("inlineEquation"),
    },
    {
        id: "editor::InsertQuote",
        label: m.menubar_insert_quote(),
        scope: "editor",
        run: () => deps.insertElement("quote"),
    },
    {
        id: "editor::InsertDiagram",
        label: m.menubar_insert_diagram(),
        scope: "editor",
        run: () => deps.insertElement("diagram"),
    },
    {
        id: "editor::InsertList",
        label: m.menubar_insert_list(),
        scope: "editor",
        run: () => deps.insertElement("list"),
    },
    {
        id: "editor::InsertEnumeration",
        label: m.menubar_insert_enumeration(),
        scope: "editor",
        run: () => deps.insertElement("enumeration"),
    },
    {
        id: "editor::InsertFigure",
        label: m.menubar_insert_figure(),
        scope: "editor",
        run: () => deps.insertElement("figure"),
    },
    {
        id: "editor::DeleteElement",
        label: m.menubar_delete_element(),
        scope: "editor",
        isEnabled: () => false,
        run: () => undefined,
    },
    {
        id: "editor::InsertReference",
        label: m.menubar_insert_reference(),
        scope: "editor",
        run: () => undefined,
    },
    {
        id: "editor::Bold",
        label: m.menubar_text_bold(),
        scope: "editor",
        run: () => deps.applyRichTextMark("bold"),
    },
    {
        id: "editor::Italic",
        label: m.menubar_text_italic(),
        scope: "editor",
        run: () => deps.applyRichTextMark("italic"),
    },
    {
        id: "editor::Underline",
        label: m.menubar_text_underline(),
        scope: "editor",
        run: () => deps.applyRichTextMark("underline"),
    },
];
