import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { TextSelection } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import type { EquationSyntax } from "../../../bindings/EquationSyntax";
import { InlineTextInput } from "../../../components/atoms/InlineTextInput/InlineTextInput";
import { EquationSyntaxField } from "../../../components/molecules/EquationSyntaxField/EquationSyntaxField";
import { InlineChipConfig } from "../../../components/molecules/InlineChipConfig/InlineChipConfig";
import { registerActiveElementSettingsToggle } from "../../elementSettingsBridge";
import { useDocument } from "../../../state/DocumentContext";
import {
    exitAfterInlineEquation,
    focusTargetForInlineEquationAtPos,
    registerInlineEquationHandle,
    setActiveInlineEquationFocus,
    unregisterInlineEquationHandle,
} from "../inlineEquationFocus";
import { normalizeEditableText } from "../../textInput";
import chipStyles from "../../../components/molecules/SimpleListField/SimpleListField.module.css";
import styles from "./inlineEquationNodeView.module.css";

export interface InlineEquationChipProps {
    node: PMNode;
    view: EditorView;
    getPos: () => number | undefined;
    tableId?: string | null;
}

export const InlineEquationChip = ({
    node,
    view,
    getPos,
    tableId = null,
}: InlineEquationChipProps) => {
    const { setDocumentFocus } = useDocument();
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const hostRef = useRef<HTMLSpanElement>(null);
    const source = (node.attrs.source as string) ?? "";
    const syntax = ((node.attrs.syntax as EquationSyntax | undefined) ?? "typst");
    const [settingsOpen, setSettingsOpen] = useState(false);

    const pushFocus = useCallback(
        (caretInSource: number) => {
            const pos = getPos();
            if (pos === undefined) {
                return;
            }
            const target = focusTargetForInlineEquationAtPos(
                view,
                pos,
                caretInSource,
                tableId,
            );
            if (!target?.fieldId || target.caretUtf16Offset === null) {
                return;
            }
            setActiveInlineEquationFocus({
                view,
                getFieldTarget: () => target,
            });
            setDocumentFocus({
                elementId: target.elementId,
                fieldId: target.fieldId,
                caretUtf16Offset: target.caretUtf16Offset,
                sourceRevision: null,
                anchorPageNumber: null,
                forcePreviewScroll: false,
                focusSource: "native",
            });
        },
        [getPos, setDocumentFocus, tableId, view],
    );

    const updateSource = useCallback(
        (nextSource: string) => {
            const pos = getPos();
            if (pos === undefined) {
                return;
            }
            const tr = view.state.tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                source: nextSource,
                label: nextSource,
            });
            view.dispatch(tr);
        },
        [getPos, node.attrs, view],
    );

    const updateSyntax = useCallback(
        (nextSyntax: EquationSyntax) => {
            const pos = getPos();
            if (pos === undefined) {
                return;
            }
            const tr = view.state.tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                syntax: nextSyntax,
            });
            view.dispatch(tr);
        },
        [getPos, node.attrs, view],
    );

    const removeIfEmpty = useCallback(() => {
        const pos = getPos();
        if (pos === undefined) {
            return;
        }
        const current = (view.state.doc.nodeAt(pos)?.attrs.source as string) ?? "";
        if (current.trim().length > 0) {
            return;
        }
        view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
    }, [getPos, node.nodeSize, view]);

    const exitAfter = useCallback(() => {
        const pos = getPos();
        if (pos === undefined) {
            return;
        }
        setActiveInlineEquationFocus(null);
        exitAfterInlineEquation(view, pos, node.nodeSize);
    }, [getPos, node.nodeSize, view]);

    const focusInput = useCallback(
        (caret?: number) => {
            const input = inputRef.current;
            if (!input) {
                return;
            }
            input.focus();
            const index =
                caret === undefined ? input.value.length : Math.max(0, caret);
            input.setSelectionRange(index, index);
            pushFocus(index);
        },
        [pushFocus],
    );

    useEffect(() => {
        const host = hostRef.current;
        if (!host) {
            return;
        }
        registerInlineEquationHandle(host, {
            focus: focusInput,
            blur: () => inputRef.current?.blur(),
            isFocused: () => document.activeElement === inputRef.current,
        });
        return () => unregisterInlineEquationHandle(host);
    }, [focusInput]);

    useEffect(() => {
        const input = inputRef.current;
        if (!input) {
            return;
        }

        let unregister: (() => void) | null = null;
        const handleFocus = () => {
            unregister?.();
            unregister = registerActiveElementSettingsToggle(() => {
                setSettingsOpen((value) => !value);
            });
        };
        const handleBlur = () => {
            unregister?.();
            unregister = null;
        };

        input.addEventListener("focus", handleFocus);
        input.addEventListener("blur", handleBlur);
        return () => {
            input.removeEventListener("focus", handleFocus);
            input.removeEventListener("blur", handleBlur);
            handleBlur();
        };
    }, []);

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
        const input = event.currentTarget;
        const caret = input.selectionStart ?? 0;
        const length = input.value.length;

        if (event.key === "Escape") {
            event.preventDefault();
            exitAfter();
            return;
        }

        if (
            event.key === "Enter" &&
            (event.ctrlKey || event.metaKey) &&
            !event.shiftKey
        ) {
            event.preventDefault();
            exitAfter();
            return;
        }

        if (event.key === "ArrowLeft" && caret === 0) {
            event.preventDefault();
            const pos = getPos();
            if (pos === undefined) {
                return;
            }
            setActiveInlineEquationFocus(null);
            view.dispatch(
                view.state.tr
                    .setSelection(TextSelection.create(view.state.doc, pos))
                    .scrollIntoView(),
            );
            view.focus();
            return;
        }

        if (event.key === "ArrowRight" && caret === length) {
            exitAfter();
        }
    };

    return (
        <span ref={hostRef} className={styles.host} data-inline-equation-host>
            <span className={styles.chipShell} data-inline-chip-shell>
                <span
                    className={`${chipStyles.chipCommitted} ${styles.wrappingChip}`}
                >
                    <span className={styles.mathMark} aria-hidden="true">
                        $
                    </span>
                    <InlineTextInput
                        ref={inputRef}
                        wrap
                        variant="chip"
                        className={chipStyles.chipInput}
                        value={source}
                        placeholder="x"
                        onBlur={() => {
                            setActiveInlineEquationFocus(null);
                            removeIfEmpty();
                        }}
                        onChange={(event) => {
                            const next = normalizeEditableText(event.target.value);
                            updateSource(next);
                            pushFocus(event.target.selectionStart ?? next.length);
                        }}
                        onFocus={() => {
                            pushFocus(inputRef.current?.selectionStart ?? source.length);
                        }}
                        onSelect={() => {
                            pushFocus(inputRef.current?.selectionStart ?? source.length);
                        }}
                        onKeyDown={handleKeyDown}
                    />
                    <span className={styles.mathMark} aria-hidden="true">
                        $
                    </span>
                </span>
                <InlineChipConfig
                    open={settingsOpen}
                    onOpenChange={setSettingsOpen}
                >
                    <EquationSyntaxField value={syntax} onChange={updateSyntax} />
                </InlineChipConfig>
            </span>
        </span>
    );
};
