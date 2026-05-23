import type { Command } from "./types";
import { m } from "../paraglide/messages.js";

export type ElementType = "heading" | "paragraph" | "table" | "equation" | "figure";

export interface EditorCommandDeps {
    insertElement: (elementType: ElementType) => void;
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
        isEnabled: () => false,
        run: () => undefined,
    },
];
