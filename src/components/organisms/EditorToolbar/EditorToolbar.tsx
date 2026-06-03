import { memo, type MouseEvent } from "react";
import {
    Diagram24Regular,
    TextHeader124Regular,
    TextBold24Regular,
    TextBulletList24Regular,
    TextItalic24Regular,
    TextNumberListLtr24Regular,
    TextQuote24Regular,
    TextUnderline24Regular,
    Table24Regular,
    MathFormula24Regular,
    Image24Regular,
    Link24Regular,
    Delete24Regular,
} from "@fluentui/react-icons";
import { IconButton } from "../../atoms/IconButton/IconButton";
import { Toolbar, ToolbarGroup } from "../../molecules/Toolbar/Toolbar";
import { TextParagraph24Regular } from "../../icons/TextParagraph24Regular";
import { m } from "../../../paraglide/messages.js";

/** Keep ProseMirror selection when toolbar buttons are clicked. */
const keepEditorSelection = (event: MouseEvent) => {
    event.preventDefault();
};

export interface EditorToolbarProps {
    canDeleteFocusedTarget: boolean;
    /** When true, only in-cell block inserts (no heading/table/figure/diagram). */
    tableCellEditing?: boolean;
    onDelete: () => void;
    onBold: () => void;
    onItalic: () => void;
    onUnderline: () => void;
    onInsertHeading: () => void;
    onInsertParagraph: () => void;
    onInsertQuote: () => void;
    onInsertList: () => void;
    onInsertEnumeration: () => void;
    onInsertTable: () => void;
    onInsertBlockEquation: () => void;
    onInsertInlineEquation: () => void;
    onInsertFigure: () => void;
    onInsertDiagram: () => void;
    onInsertReference: () => void;
}

export const EditorToolbar = memo(
    ({
        canDeleteFocusedTarget,
        tableCellEditing = false,
        onDelete,
        onBold,
        onItalic,
        onUnderline,
        onInsertHeading,
        onInsertParagraph,
        onInsertQuote,
        onInsertList,
        onInsertEnumeration,
        onInsertTable,
        onInsertBlockEquation,
        onInsertInlineEquation,
        onInsertFigure,
        onInsertDiagram,
        onInsertReference,
    }: EditorToolbarProps) => {
        return (
            <Toolbar scrollable>
            <ToolbarGroup>
                <IconButton
                    title={m.element_delete()}
                    aria-label={m.element_delete()}
                    disabled={!canDeleteFocusedTarget}
                    onClick={onDelete}
                >
                    <Delete24Regular />
                </IconButton>
            </ToolbarGroup>
            <ToolbarGroup>
                <IconButton
                    title={m.menubar_text_bold()}
                    aria-label={m.menubar_text_bold()}
                    onMouseDown={keepEditorSelection}
                    onClick={onBold}
                >
                    <TextBold24Regular />
                </IconButton>
                <IconButton
                    title={m.menubar_text_italic()}
                    aria-label={m.menubar_text_italic()}
                    onMouseDown={keepEditorSelection}
                    onClick={onItalic}
                >
                    <TextItalic24Regular />
                </IconButton>
                <IconButton
                    title={m.menubar_text_underline()}
                    aria-label={m.menubar_text_underline()}
                    onMouseDown={keepEditorSelection}
                    onClick={onUnderline}
                >
                    <TextUnderline24Regular />
                </IconButton>
            </ToolbarGroup>
            <ToolbarGroup>
                <IconButton
                    title={m.menubar_insert_heading()}
                    aria-label={m.menubar_insert_heading()}
                    disabled={tableCellEditing}
                    onClick={onInsertHeading}
                >
                    <TextHeader124Regular />
                </IconButton>
                <IconButton
                    title={m.menubar_insert_paragraph()}
                    aria-label={m.menubar_insert_paragraph()}
                    onClick={onInsertParagraph}
                >
                    <TextParagraph24Regular aria-hidden />
                </IconButton>
                <IconButton
                    title={m.menubar_insert_quote()}
                    aria-label={m.menubar_insert_quote()}
                    onClick={onInsertQuote}
                >
                    <TextQuote24Regular />
                </IconButton>
                <IconButton
                    title={m.menubar_insert_list()}
                    aria-label={m.menubar_insert_list()}
                    onClick={onInsertList}
                >
                    <TextBulletList24Regular />
                </IconButton>
                <IconButton
                    title={m.menubar_insert_enumeration()}
                    aria-label={m.menubar_insert_enumeration()}
                    onClick={onInsertEnumeration}
                >
                    <TextNumberListLtr24Regular />
                </IconButton>
                <IconButton
                    title={m.menubar_insert_table()}
                    aria-label={m.menubar_insert_table()}
                    disabled={tableCellEditing}
                    onClick={onInsertTable}
                >
                    <Table24Regular />
                </IconButton>
            </ToolbarGroup>
            <ToolbarGroup>
                <IconButton
                    title={m.menubar_insert_block_equation()}
                    aria-label={m.menubar_insert_block_equation()}
                    onClick={onInsertBlockEquation}
                >
                    <MathFormula24Regular />
                </IconButton>
                <IconButton
                    title={m.menubar_insert_inline_equation()}
                    aria-label={m.menubar_insert_inline_equation()}
                    onClick={onInsertInlineEquation}
                >
                    <MathFormula24Regular />
                </IconButton>
            </ToolbarGroup>
            <ToolbarGroup>
                <IconButton
                    title={m.menubar_insert_figure()}
                    aria-label={m.menubar_insert_figure()}
                    disabled={tableCellEditing}
                    onClick={onInsertFigure}
                >
                    <Image24Regular />
                </IconButton>
                <IconButton
                    title={m.menubar_insert_diagram()}
                    aria-label={m.menubar_insert_diagram()}
                    disabled={tableCellEditing}
                    onClick={onInsertDiagram}
                >
                    <Diagram24Regular />
                </IconButton>
            </ToolbarGroup>
            <ToolbarGroup>
                <IconButton
                    title={m.menubar_insert_reference()}
                    aria-label={m.menubar_insert_reference()}
                    onClick={onInsertReference}
                >
                    <Link24Regular />
                </IconButton>
            </ToolbarGroup>
        </Toolbar>
        );
    },
);

EditorToolbar.displayName = "EditorToolbar";
