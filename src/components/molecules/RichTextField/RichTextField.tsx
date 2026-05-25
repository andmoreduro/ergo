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
import {
    caretPlainOffsetFromSelection,
    parseRichTextFromEditableRoot,
    renderRichTextToEditableHtml,
} from "../../../richText/richText";
import styles from "./RichTextField.module.css";

export interface RichTextFieldBinding {
    ref: RefCallback<HTMLDivElement>;
    onFocus: FocusEventHandler<HTMLDivElement>;
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
}

export const RichTextField = ({
    label,
    importance,
    content,
    onChange,
    fieldBinding,
}: RichTextFieldProps) => {
    const editorRef = useRef<HTMLDivElement | null>(null);
    const isComposingRef = useRef(false);
    const lastRenderedRef = useRef("");

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
            restoreCaret(node, offset);
        }
    }, [content]);

    const handleInput = () => {
        const node = editorRef.current;
        if (!node) {
            return;
        }

        const parsed = parseRichTextFromEditableRoot(node);
        lastRenderedRef.current = renderRichTextToEditableHtml(parsed);
        onChange(parsed);
    };

    return (
        <div className={styles.field}>
            {label && <FieldLabel importance={importance}>{label}</FieldLabel>}
            <div
                {...fieldBinding}
                ref={setRef}
                className={styles.editor}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                onInput={handleInput}
                onCompositionStart={() => {
                    isComposingRef.current = true;
                }}
                onCompositionEnd={() => {
                    isComposingRef.current = false;
                    handleInput();
                }}
            />
        </div>
    );
};

const restoreCaret = (root: HTMLElement, offset: number) => {
    const selection = document.getSelection();
    if (!selection) {
        return;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let textNode: Text | null = null;

    while ((textNode = walker.nextNode() as Text | null)) {
        const length = textNode.textContent?.length ?? 0;
        if (remaining <= length) {
            const range = document.createRange();
            range.setStart(textNode, remaining);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            return;
        }
        remaining -= length;
    }

    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
};
