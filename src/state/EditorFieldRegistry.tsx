import {
    createContext,
    useCallback,
    useContext,
    useLayoutEffect,
    useMemo,
    useRef,
    type FocusEventHandler,
    type KeyboardEventHandler,
    type MouseEventHandler,
    type ReactNode,
    type RefCallback,
    type SyntheticEvent,
} from "react";
import { caretPlainOffsetFromSelection } from "../richText/richText";
import { useDocument } from "./DocumentContext";

type EditorFieldElement =
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
    | HTMLDivElement;

interface RegisteredEditorField {
    elementId: string;
    fieldId: string;
    node: EditorFieldElement;
}

interface EditorFieldRegistryValue {
    registerField: (field: RegisteredEditorField) => void;
    unregisterField: (fieldId: string) => void;
    getField: (fieldId: string) => RegisteredEditorField | undefined;
}

const EditorFieldRegistryContext =
    createContext<EditorFieldRegistryValue | null>(null);

export const EditorFieldRegistryProvider = ({
    children,
}: {
    children: ReactNode;
}) => {
    const fieldsRef = useRef(new Map<string, RegisteredEditorField>());

    const registerField = useCallback((field: RegisteredEditorField) => {
        fieldsRef.current.set(field.fieldId, field);
    }, []);

    const unregisterField = useCallback((fieldId: string) => {
        fieldsRef.current.delete(fieldId);
    }, []);

    const getField = useCallback((fieldId: string) => {
        return fieldsRef.current.get(fieldId);
    }, []);

    const value = useMemo<EditorFieldRegistryValue>(
        () => ({ registerField, unregisterField, getField }),
        [getField, registerField, unregisterField],
    );

    return (
        <EditorFieldRegistryContext.Provider value={value}>
            {children}
        </EditorFieldRegistryContext.Provider>
    );
};

export interface EditorFieldBinding<T extends EditorFieldElement> {
    ref: RefCallback<T>;
    onFocus: FocusEventHandler<T>;
    onSelect: (event: SyntheticEvent<T>) => void;
    onKeyUp: KeyboardEventHandler<T>;
    onClick: MouseEventHandler<T>;
    "data-editor-element-id": string;
    "data-editor-field-id": string;
}

export const useEditorFieldBinding = <T extends EditorFieldElement>({
    elementId,
    fieldId,
}: {
    elementId: string;
    fieldId: string;
}): EditorFieldBinding<T> => {
    const registry = useContext(EditorFieldRegistryContext);
    const { documentFocus, setDocumentFocus } = useDocument();
    const nodeRef = useRef<T | null>(null);
    const lastAppliedRequestRef = useRef<number | null>(null);
    const isApplyingProgrammaticFocusRef = useRef(false);
    const programmaticFocusTimeoutRef = useRef<number | null>(null);

    const ref = useCallback<RefCallback<T>>(
        (node) => {
            if (nodeRef.current) {
                registry?.unregisterField(fieldId);
            }

            nodeRef.current = node;

            if (node) {
                registry?.registerField({ elementId, fieldId, node });
            }
        },
        [elementId, fieldId, registry],
    );

    const updateNativeFocus = useCallback(
        (node: T) => {
            if (isApplyingProgrammaticFocusRef.current) {
                return;
            }

            setDocumentFocus({
                elementId,
                fieldId,
                caretUtf16Offset: caretOffsetFromNode(node),
                sourceRevision: null,
                focusSource: "native",
            });
        },
        [elementId, fieldId, setDocumentFocus],
    );

    const onFocus = useCallback<FocusEventHandler<T>>(
        (event) => updateNativeFocus(event.currentTarget),
        [updateNativeFocus],
    );

    const onSelect = useCallback(
        (event: SyntheticEvent<T>) => updateNativeFocus(event.currentTarget),
        [updateNativeFocus],
    );

    const onKeyUp = useCallback<KeyboardEventHandler<T>>(
        (event) => updateNativeFocus(event.currentTarget),
        [updateNativeFocus],
    );

    const onClick = useCallback<MouseEventHandler<T>>(
        (event) => updateNativeFocus(event.currentTarget),
        [updateNativeFocus],
    );

    useLayoutEffect(() => {
        const node = nodeRef.current;
        if (
            !node ||
            documentFocus.fieldId !== fieldId ||
            documentFocus.focusSource === "native" ||
            lastAppliedRequestRef.current === documentFocus.requestId
        ) {
            return;
        }

        lastAppliedRequestRef.current = documentFocus.requestId;
        isApplyingProgrammaticFocusRef.current = true;
        if (programmaticFocusTimeoutRef.current !== null) {
            window.clearTimeout(programmaticFocusTimeoutRef.current);
            programmaticFocusTimeoutRef.current = null;
        }
        try {
            node.scrollIntoView?.({ block: "center", behavior: "smooth" });
            node.focus();

            if (typeof documentFocus.caretUtf16Offset === "number") {
                if (isTextSelectionField(node)) {
                    const caret = Math.max(
                        0,
                        Math.min(documentFocus.caretUtf16Offset, node.value.length),
                    );
                    node.setSelectionRange(caret, caret);
                } else if (node instanceof HTMLDivElement) {
                    restoreRichTextCaret(node, documentFocus.caretUtf16Offset);
                }
            }
        } finally {
            programmaticFocusTimeoutRef.current = window.setTimeout(() => {
                isApplyingProgrammaticFocusRef.current = false;
                programmaticFocusTimeoutRef.current = null;
            }, 0);
        }
    }, [documentFocus, fieldId]);

    return {
        ref,
        onFocus,
        onSelect,
        onKeyUp,
        onClick,
        "data-editor-element-id": elementId,
        "data-editor-field-id": fieldId,
    };
};

const caretOffsetFromNode = (node: EditorFieldElement): number | null => {
    if (isTextSelectionField(node)) {
        return node.selectionStart;
    }

    if (node instanceof HTMLDivElement) {
        const selection = document.getSelection();
        if (!selection) {
            return null;
        }
        return caretPlainOffsetFromSelection(node, selection);
    }

    return null;
};

const restoreRichTextCaret = (root: HTMLDivElement, offset: number) => {
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

const isTextSelectionField = (
    node: EditorFieldElement,
): node is HTMLInputElement | HTMLTextAreaElement => {
    if (node instanceof HTMLTextAreaElement) {
        return true;
    }

    if (!(node instanceof HTMLInputElement)) {
        return false;
    }

    return [
        "",
        "email",
        "number",
        "password",
        "search",
        "tel",
        "text",
        "url",
    ].includes(node.type);
};
