import {
    useCallback,
    useLayoutEffect,
    useRef,
    type FocusEventHandler,
    type KeyboardEventHandler,
    type MouseEventHandler,
    type RefCallback,
    type SyntheticEvent,
} from "react";
import type { RichText } from "../../../bindings/RichText";
import { FieldLabel, type FieldImportance } from "../../atoms/FieldLabel/FieldLabel";
import { RichTextEditable } from "../../atoms/RichTextEditable/RichTextEditable";
import {
    caretPlainOffsetFromSelection,
    parseRichTextFromEditableRoot,
    renderRichTextToEditableHtml,
    restoreCaretAtPlainOffset,
} from "../../../richText/richText";
import styles from "./RichTextField.module.css";

export interface RichTextFieldBinding {
    ref: RefCallback<HTMLDivElement>;
    onFocus: FocusEventHandler<HTMLDivElement>;
    onBlur: FocusEventHandler<HTMLDivElement>;
    onInput: (event: SyntheticEvent<HTMLDivElement>) => void;
    onSelect: (event: SyntheticEvent<HTMLDivElement>) => void;
    onKeyUp: KeyboardEventHandler<HTMLDivElement>;
    onClick: MouseEventHandler<HTMLDivElement>;
    "data-editor-element-id": string;
    "data-editor-field-id": string;
}

export interface RichTextFieldProps {
    label?: string;
    importance?: FieldImportance;
    content: RichText[];
    onChange: (content: RichText[]) => void;
    fieldBinding: RichTextFieldBinding;
    onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
    onBlur?: FocusEventHandler<HTMLDivElement>;
    /** Minimal chrome for document body text (paragraphs, headings). */
    variant?: "default" | "document";
}

export const RichTextField = ({
    label,
    importance,
    content,
    onChange,
    fieldBinding,
    onKeyDown,
    onBlur,
    variant = "default",
}: RichTextFieldProps) => {
    const editorRef = useRef<HTMLDivElement | null>(null);
    const isComposingRef = useRef(false);
    const lastRenderedRef = useRef("");

    const adjustEditorHeight = useCallback(() => {
        const node = editorRef.current;
        if (!node) {
            return;
        }
        node.style.height = "auto";
        node.style.height = `${node.scrollHeight}px`;
    }, []);

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

        const html = renderRichTextToEditableHtml(content);
        if (html === lastRenderedRef.current && node.innerHTML === html) {
            return;
        }

        const selection = document.getSelection();
        const offset =
            selection && node.contains(selection.anchorNode)
                ? caretPlainOffsetFromSelection(node, selection)
                : null;

        node.innerHTML = html || "<br />";
        lastRenderedRef.current = html;

        if (offset !== null && selection) {
            restoreCaretAtPlainOffset(node, offset);
        }

        adjustEditorHeight();
    }, [adjustEditorHeight, content]);

    const handleInput = (event?: SyntheticEvent<HTMLDivElement>) => {
        const node = editorRef.current;
        if (!node) {
            return;
        }

        const parsed = parseRichTextFromEditableRoot(node);
        lastRenderedRef.current = renderRichTextToEditableHtml(parsed);
        onChange(parsed);
        adjustEditorHeight();
        if (event) {
            fieldBinding.onInput(event);
        }
    };

    const fieldClass =
        variant === "document" ? `${styles.field} ${styles.documentField}` : styles.field;

    return (
        <div className={fieldClass}>
            {label && <FieldLabel importance={importance}>{label}</FieldLabel>}
            <RichTextEditable
                {...fieldBinding}
                ref={setRef}
                variant={variant}
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
