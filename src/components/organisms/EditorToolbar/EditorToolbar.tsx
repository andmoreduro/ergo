import { memo } from "react";
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
import type { TemplateVariantSpec } from "../../../bindings/TemplateVariantSpec";
import { IconButton } from "../../atoms/IconButton/IconButton";
import { FieldLabel } from "../../atoms/FieldLabel/FieldLabel";
import { Select } from "../../atoms/Select/Select";
import { Toolbar, ToolbarGroup, ToolbarSpacer } from "../../molecules/Toolbar/Toolbar";
import { TextParagraph24Regular } from "../../icons/TextParagraph24Regular";
import { m } from "../../../paraglide/messages.js";
import styles from "./EditorToolbar.module.css";

export interface EditorToolbarProps {
    canDeleteFocusedTarget: boolean;
    templateVariants: TemplateVariantSpec[];
    resolvedVariantId: string;
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
    onVariantChange: (variantId: string) => void;
}

export const EditorToolbar = memo(
    ({
        canDeleteFocusedTarget,
        templateVariants,
        resolvedVariantId,
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
        onVariantChange,
    }: EditorToolbarProps) => (
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
                    onClick={onBold}
                >
                    <TextBold24Regular />
                </IconButton>
                <IconButton
                    title={m.menubar_text_italic()}
                    aria-label={m.menubar_text_italic()}
                    onClick={onItalic}
                >
                    <TextItalic24Regular />
                </IconButton>
                <IconButton
                    title={m.menubar_text_underline()}
                    aria-label={m.menubar_text_underline()}
                    onClick={onUnderline}
                >
                    <TextUnderline24Regular />
                </IconButton>
            </ToolbarGroup>
            <ToolbarGroup>
                <IconButton
                    title={m.menubar_insert_heading()}
                    aria-label={m.menubar_insert_heading()}
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
                    onClick={onInsertFigure}
                >
                    <Image24Regular />
                </IconButton>
                <IconButton
                    title={m.menubar_insert_diagram()}
                    aria-label={m.menubar_insert_diagram()}
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
            {templateVariants.length > 1 ? (
                <>
                    <ToolbarSpacer />
                    <FieldLabel
                        htmlFor="template-variant"
                        className={styles.variantToolbarLabel}
                    >
                        {m.settings_template_variant()}
                    </FieldLabel>
                    <Select
                        id="template-variant"
                        variant="inline"
                        aria-label={m.settings_template_variant()}
                        value={resolvedVariantId}
                        options={templateVariants.map((variant) => ({
                            value: variant.id,
                            label: variant.label,
                        }))}
                        onChange={(event) => onVariantChange(event.target.value)}
                    />
                </>
            ) : null}
        </Toolbar>
    ),
);

EditorToolbar.displayName = "EditorToolbar";
