import {
    useCallback,
    useLayoutEffect,
    useRef,
    type FocusEventHandler,
    type KeyboardEventHandler,
    type RefCallback,
    type SyntheticEvent,
} from "react";
import { useAutoHeight } from "../../atoms/useAutoHeight";
import type { RichText } from "../../../bindings/RichText";
import { FieldLabel, type FieldImportance } from "../../atoms/FieldLabel/FieldLabel";
import { RichTextEditable } from "../../atoms/RichTextEditable/RichTextEditable";
import {
    caretPlainOffsetFromSelection,
    parseRichTextParagraphsFromEditableRoot,
    renderRichTextParagraphsToEditableHtml,
    restoreCaretAtPlainOffset,
} from "../../../richText/richText";
import type { RichTextFieldBinding } from "../RichTextField/RichTextField";
import styles from "../RichTextField/RichTextField.module.css";

export interface ParagraphsFieldProps {
    label?: string;
    importance?: FieldImportance;
    /** One `RichText[]` per paragraph. */
    paragraphs: RichText[][];
    onChange: (paragraphs: RichText[][]) => void;
    fieldBinding: RichTextFieldBinding;
    onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
    onBlur?: FocusEventHandler<HTMLDivElement>;
}

/**
 * Multi-paragraph rich-text editor: a single contenteditable box where Enter
 * starts a new paragraph (Shift+Enter inserts a line break within one). Value is
 * an array of paragraphs. Mirrors `RichTextField`'s controlled-but-caret-stable
 * pattern — the caret offset functions count text in document order, so they work
 * across paragraph blocks unchanged.
 */
export const ParagraphsField = ({
    label,
    importance,
    paragraphs,
    onChange,
    fieldBinding,
    onKeyDown,
    onBlur,
}: ParagraphsFieldProps) => {
    const editorRef = useRef<HTMLDivElement | null>(null);
    const isComposingRef = useRef(false);
    const lastRenderedRef = useRef("");

    const adjustEditorHeight = useAutoHeight(editorRef);

    const setRef = useCallback<RefCallback<HTMLDivElement>>(
        (node) => {
            editorRef.current = node;
            fieldBinding.ref(node);
        },
        [fieldBinding],
    );

    useLayoutEffect(() => {
        const node = editorRef.current;
        if (!node || isComposingRef.current) {
            return;
        }

        const html = renderRichTextParagraphsToEditableHtml(paragraphs);
        if (html === lastRenderedRef.current && node.innerHTML === html) {
            return;
        }

        const selection = document.getSelection();
        const offset =
            selection && node.contains(selection.anchorNode)
                ? caretPlainOffsetFromSelection(node, selection)
                : null;

        node.innerHTML = html;
        lastRenderedRef.current = html;

        if (offset !== null && selection) {
            restoreCaretAtPlainOffset(node, offset);
        }

        adjustEditorHeight();
    }, [adjustEditorHeight, paragraphs]);

    const handleInput = (event?: SyntheticEvent<HTMLDivElement>) => {
        const node = editorRef.current;
        if (!node) {
            return;
        }

        const parsed = parseRichTextParagraphsFromEditableRoot(node, {
            keepTrailingEmptyParagraph: true,
        });
        lastRenderedRef.current = renderRichTextParagraphsToEditableHtml(parsed);
        onChange(parsed);
        adjustEditorHeight();
        if (event) {
            fieldBinding.onInput(event);
        }
    };

    return (
        <div className={styles.field}>
            {label && <FieldLabel importance={importance}>{label}</FieldLabel>}
            <RichTextEditable
                {...fieldBinding}
                ref={setRef}
                variant="default"
                onInput={handleInput}
                onCompositionStart={() => {
                    isComposingRef.current = true;
                }}
                onCompositionEnd={(event) => {
                    isComposingRef.current = false;
                    handleInput(event);
                }}
                onKeyDown={onKeyDown}
                onBlur={(event) => {
                    fieldBinding.onBlur(event);
                    onBlur?.(event);
                }}
            />
        </div>
    );
};
