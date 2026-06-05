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
import { InlineTextInput } from "../../../components/atoms/InlineTextInput/InlineTextInput";
import { QuoteSettingsContext } from "../../../actions/contexts/QuoteSettingsContext";
import { InlineChipConfig } from "../../../components/molecules/InlineChipConfig/InlineChipConfig";
import { QuoteAttributionField } from "../../../components/molecules/QuoteAttributionField/QuoteAttributionField";
import {
    quoteAttributionFromNodeAttrs,
    richTextQuoteAttributionFields,
    type QuoteAttributionValue,
} from "../../quoteAttribution";
import { registerActiveElementSettingsToggle } from "../../elementSettingsBridge";
import {
    useDocument,
    useDocumentAstSelector,
} from "../../../state/DocumentContext";
import { m } from "../../../paraglide/messages.js";
import {
    exitAfterInlineQuote,
    focusTargetForInlineQuoteAtPos,
    registerInlineQuoteHandle,
    setActiveInlineQuoteFocus,
    unregisterInlineQuoteHandle,
} from "../inlineQuoteFocus";
import { normalizeEditableText } from "../../textInput";
import chipStyles from "../../../components/molecules/SimpleListField/SimpleListField.module.css";
import styles from "./inlineQuoteNodeView.module.css";

export interface InlineQuoteChipProps {
    node: PMNode;
    view: EditorView;
    getPos: () => number | undefined;
    tableId?: string | null;
}

export const InlineQuoteChip = ({
    node,
    view,
    getPos,
    tableId = null,
}: InlineQuoteChipProps) => {
    const { setDocumentFocus } = useDocument();
    const references = useDocumentAstSelector(
        (ast) => ast.references,
        (left, right) =>
            left.length === right.length &&
            left.every((entry, index) => entry.id === right[index]?.id),
    );
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const hostRef = useRef<HTMLSpanElement>(null);
    const source = (node.attrs.source as string) ?? "";
    const attribution = quoteAttributionFromNodeAttrs(node.attrs);
    const [settingsOpen, setSettingsOpen] = useState(false);

    const pushFocus = useCallback(
        (caretInSource: number) => {
            const pos = getPos();
            if (pos === undefined) {
                return;
            }
            const target = focusTargetForInlineQuoteAtPos(
                view,
                pos,
                caretInSource,
                tableId,
            );
            if (!target?.fieldId || target.caretUtf16Offset === null) {
                return;
            }
            setActiveInlineQuoteFocus({
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

    const updateAttribution = useCallback(
        (nextAttribution: QuoteAttributionValue) => {
            const pos = getPos();
            if (pos === undefined) {
                return;
            }
            const fields = richTextQuoteAttributionFields(nextAttribution);
            const tr = view.state.tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                attributionText: fields.quote_attribution_text ?? "",
                attributionReferenceId:
                    fields.quote_attribution_reference_id ?? "",
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
        setActiveInlineQuoteFocus(null);
        exitAfterInlineQuote(view, pos, node.nodeSize);
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
        registerInlineQuoteHandle(host, {
            focus: focusInput,
            blur: () => inputRef.current?.blur(),
            isFocused: () => document.activeElement === inputRef.current,
        });
        return () => unregisterInlineQuoteHandle(host);
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
            setActiveInlineQuoteFocus(null);
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
        <span ref={hostRef} className={styles.host} data-inline-quote-host>
            <span className={styles.chipShell} data-inline-chip-shell>
                <span
                    className={`${chipStyles.chipCommitted} ${styles.wrappingChip}`}
                >
                    <span className={styles.quoteMark} aria-hidden="true">
                        {"\u201C"}
                    </span>
                    <InlineTextInput
                        ref={inputRef}
                        wrap
                        variant="chip"
                        className={chipStyles.chipInput}
                        value={source}
                        placeholder={m.editor_inline_quote_placeholder()}
                        onBlur={() => {
                            setActiveInlineQuoteFocus(null);
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
                    <span className={styles.quoteMark} aria-hidden="true">
                        {"\u201D"}
                    </span>
                </span>
                <InlineChipConfig
                    open={settingsOpen}
                    onOpenChange={setSettingsOpen}
                >
                    <QuoteSettingsContext inline active={settingsOpen}>
                        <QuoteAttributionField
                            references={references}
                            value={attribution}
                            onChange={updateAttribution}
                        />
                    </QuoteSettingsContext>
                </InlineChipConfig>
            </span>
        </span>
    );
};
