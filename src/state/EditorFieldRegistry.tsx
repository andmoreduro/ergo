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
import {
    fallbackFieldIdsAfterBlur,
    isEditorFieldTarget,
    isEditorFocusLoseExempt,
} from "../editor/editorFocusTargets";
import { isContentSectionPointerFocusTarget } from "../editor/contentSectionFocus";
import { isUiOnlyComposerFieldId } from "../editor/fieldIds";
import { caretPlainOffsetFromSelection } from "../richText/richText";
import { useDocument } from "./DocumentContext";

export const EditorFieldRegistryContext =
    createContext<EditorFieldRegistryValue | null>(null);

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
    recordFieldFocus: (fieldId: string) => void;
    restoreFocusAfterBlur: (blurredFieldId: string) => void;
}

export const EditorFieldRegistryProvider = ({
    children,
}: {
    children: ReactNode;
}) => {
    const fieldsRef = useRef(new Map<string, RegisteredEditorField>());
    const activeFieldIdRef = useRef<string | null>(null);
    const lastFocusedFieldIdRef = useRef<string | null>(null);

    const registerField = useCallback((field: RegisteredEditorField) => {
        fieldsRef.current.set(field.fieldId, field);
    }, []);

    const unregisterField = useCallback((fieldId: string) => {
        fieldsRef.current.delete(fieldId);
    }, []);

    const getField = useCallback((fieldId: string) => {
        return fieldsRef.current.get(fieldId);
    }, []);

    const recordFieldFocus = useCallback((fieldId: string) => {
        lastFocusedFieldIdRef.current = fieldId;
        activeFieldIdRef.current = fieldId;
    }, []);

    const focusRegisteredField = useCallback((fieldId: string | null) => {
        if (!fieldId) {
            return false;
        }

        const field = fieldsRef.current.get(fieldId);
        if (!field?.node.isConnected) {
            return false;
        }

        field.node.focus();
        return true;
    }, []);

    const restoreFocusAfterBlur = useCallback(
        (blurredFieldId: string) => {
            if (focusRegisteredField(blurredFieldId)) {
                return;
            }

            if (focusRegisteredField(lastFocusedFieldIdRef.current)) {
                return;
            }

            for (const fallbackFieldId of fallbackFieldIdsAfterBlur(
                blurredFieldId,
            )) {
                if (focusRegisteredField(fallbackFieldId)) {
                    return;
                }
            }
        },
        [focusRegisteredField],
    );

    const value = useMemo<EditorFieldRegistryValue>(
        () => ({
            registerField,
            unregisterField,
            getField,
            recordFieldFocus,
            restoreFocusAfterBlur,
        }),
        [
            getField,
            recordFieldFocus,
            registerField,
            restoreFocusAfterBlur,
            unregisterField,
        ],
    );

    useLayoutEffect(() => {
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof HTMLElement && target.closest("[data-editor-field-id]")) {
                const fieldId = target
                    .closest<HTMLElement>("[data-editor-field-id]")
                    ?.dataset.editorFieldId;
                activeFieldIdRef.current = fieldId ?? null;
                return;
            }

            if (isContentSectionPointerFocusTarget(target)) {
                return;
            }

            const activeFieldId = activeFieldIdRef.current;
            if (!activeFieldId || isEditorFieldTarget(target)) {
                return;
            }

            const field = fieldsRef.current.get(activeFieldId);
            if (!field) {
                return;
            }

            event.preventDefault();
            requestAnimationFrame(() => {
                field.node.focus();
            });
        };

        document.addEventListener("pointerdown", onPointerDown, true);
        return () => document.removeEventListener("pointerdown", onPointerDown, true);
    }, []);

    return (
        <EditorFieldRegistryContext.Provider value={value}>
            {children}
        </EditorFieldRegistryContext.Provider>
    );
};

export interface EditorFieldBinding<T extends EditorFieldElement> {
    ref: RefCallback<T>;
    onFocus: FocusEventHandler<T>;
    onBlur: FocusEventHandler<T>;
    onInput: (event: SyntheticEvent<T>) => void;
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

    const onBlur = useEditorFocusLostRecovery(fieldId, registry);

    const updateNativeFocus = useCallback(
        (node: T) => {
            if (isApplyingProgrammaticFocusRef.current) {
                return;
            }

            registry?.recordFieldFocus(fieldId);

            if (isUiOnlyComposerFieldId(fieldId)) {
                return;
            }

            setDocumentFocus({
                elementId,
                fieldId,
                caretUtf16Offset: caretOffsetFromNode(node),
                sourceRevision: null,
                anchorPageNumber: null,
                forcePreviewScroll: false,
                focusSource: "native",
            });
        },
        [elementId, fieldId, registry, setDocumentFocus],
    );

    const onFocus = useCallback<FocusEventHandler<T>>(
        (event) => updateNativeFocus(event.currentTarget),
        [updateNativeFocus],
    );

    const onSelect = useCallback(
        (event: SyntheticEvent<T>) => updateNativeFocus(event.currentTarget),
        [updateNativeFocus],
    );

    const onInput = useCallback(
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
        onBlur,
        onInput,
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

export const useEditorFocusLostRecovery = (
    blurredFieldId: string,
    registry: EditorFieldRegistryValue | null,
): FocusEventHandler<EditorFieldElement> => {
    return useCallback(
        (event) => {
            requestAnimationFrame(() => {
                if (isEditorFieldTarget(document.activeElement)) {
                    return;
                }

                if (
                    isEditorFocusLoseExempt(event.relatedTarget) ||
                    isEditorFocusLoseExempt(document.activeElement)
                ) {
                    return;
                }

                registry?.restoreFocusAfterBlur(blurredFieldId);
            });
        },
        [blurredFieldId, registry],
    );
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
