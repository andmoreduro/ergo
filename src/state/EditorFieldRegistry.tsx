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
import { useDocument } from "./DocumentContext";

type EditorFieldElement =
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement;

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
        node.scrollIntoView?.({ block: "center", behavior: "smooth" });
        node.focus();

        if (
            typeof documentFocus.caretUtf16Offset === "number" &&
            isTextSelectionField(node)
        ) {
            const caret = Math.max(
                0,
                Math.min(documentFocus.caretUtf16Offset, node.value.length),
            );
            node.setSelectionRange(caret, caret);
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

    return null;
};

const isTextSelectionField = (
    node: EditorFieldElement,
): node is HTMLInputElement | HTMLTextAreaElement => {
    return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement;
};
