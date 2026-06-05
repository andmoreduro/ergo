import {
    memo,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    ChevronDown24Regular,
    ChevronLeft24Regular,
    ChevronRight24Regular,
    Dismiss24Regular,
} from "@fluentui/react-icons";
import { Button } from "../../atoms/Button/Button";
import { IconButton } from "../../atoms/IconButton/IconButton";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { m } from "../../../paraglide/messages.js";
import {
    captureFindTarget,
    clearEditorFind,
    clearFindTarget,
    restoreFindTarget,
    runEditorReplace,
} from "../../../editor/find/editorFind";
import {
    findInDocument,
    replaceInDocumentField,
} from "../../../editor/find/documentFind";
import { registerFindBarController } from "../../../editor/find/findBridge";
import {
    useDocumentActions,
    useDocumentAstSelector,
    useDocumentFocusSelector,
} from "../../../state/DocumentContext";
import { useTemplateSpecContext } from "../../../state/TemplateSpecContext";
import styles from "./FindBar.module.css";

export interface FindBarProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const FindBar = memo(({ open, onOpenChange }: FindBarProps) => {
    const ast = useDocumentAstSelector((state) => state);
    const focus = useDocumentFocusSelector((state) => state);
    const { setDocumentFocus } = useDocumentActions();
    const { spec: templateSpec, variantId: templateVariantId } =
        useTemplateSpecContext();
    const [query, setQuery] = useState("");
    const [replacement, setReplacement] = useState("");
    const [showReplace, setShowReplace] = useState(false);
    const [status, setStatus] = useState("");
    const queryRef = useRef<HTMLInputElement>(null);
    const openRef = useRef(open);
    openRef.current = open;
    const capturedTargetRef = useRef(false);
    const lastMatchRef = useRef<{
        elementId: string;
        fieldId: string;
        start: number;
        end: number;
    } | null>(null);

    const findAnchor = useCallback(
        (direction: 1 | -1) => {
            const last = lastMatchRef.current;
            if (last) {
                return {
                    elementId: last.elementId,
                    fieldId: last.fieldId,
                    offset: direction > 0 ? last.end : last.start,
                };
            }
            return {
                elementId: focus.elementId,
                fieldId: focus.fieldId,
                offset: focus.caretUtf16Offset ?? 0,
            };
        },
        [focus.caretUtf16Offset, focus.elementId, focus.fieldId],
    );

    const close = useCallback(() => {
        clearEditorFind();
        restoreFindTarget();
        clearFindTarget();
        capturedTargetRef.current = false;
        lastMatchRef.current = null;
        onOpenChange(false);
        setStatus("");
    }, [onOpenChange]);

    const runFind = useCallback(
        (direction: 1 | -1) => {
            if (!query.trim()) {
                setStatus(m.find_no_query());
                return;
            }
            const match = findInDocument(
                ast,
                templateSpec,
                templateVariantId,
                query,
                direction,
                findAnchor(direction),
                setDocumentFocus,
            );
            if (match) {
                lastMatchRef.current = {
                    elementId: match.elementId,
                    fieldId: match.fieldId,
                    start: match.start,
                    end: match.end,
                };
            }
            setStatus(match ? m.find_match_found() : m.find_no_matches());
        },
        [
            ast,
            findAnchor,
            query,
            setDocumentFocus,
            templateSpec,
            templateVariantId,
        ],
    );

    const openBar = useCallback(() => {
        captureFindTarget();
        capturedTargetRef.current = true;
        onOpenChange(true);
        window.requestAnimationFrame(() => {
            queryRef.current?.focus();
            queryRef.current?.select();
        });
    }, [onOpenChange]);

    useEffect(() => {
        registerFindBarController({
            open: openBar,
            close,
            findNext: () => {
                if (!openRef.current) {
                    openBar();
                }
                runFind(1);
            },
            findPrevious: () => {
                if (!openRef.current) {
                    openBar();
                }
                runFind(-1);
            },
        });
        return () => registerFindBarController(null);
    }, [close, openBar, runFind]);

    useEffect(() => {
        if (!open) {
            capturedTargetRef.current = false;
            return;
        }
        if (!capturedTargetRef.current) {
            captureFindTarget();
            capturedTargetRef.current = true;
        }
        window.requestAnimationFrame(() => {
            queryRef.current?.focus();
            queryRef.current?.select();
        });
    }, [open]);

    if (!open) {
        return null;
    }

    const replaceCurrent = () => {
        const replaced = replaceInDocumentField(
            ast,
            templateSpec,
            templateVariantId,
            query,
            replacement,
            findAnchor(1),
            setDocumentFocus,
        );
        setStatus(
            replaced ? m.find_replaced_one() : m.find_no_matches(),
        );
    };

    const replaceAll = () => {
        const count = runEditorReplace(query, replacement, true);
        setStatus(
            count > 0
                ? m.find_replaced_count({ count: String(count) })
                : m.find_no_matches(),
        );
    };

    return (
        <div className={styles.findBar} data-ergo-find-bar="">
            <div className={styles.mainRow}>
                <div className={styles.queryGroup}>
                    <TextInput
                        ref={queryRef}
                        variant="compact"
                        className={styles.compactInput}
                        fullWidth
                        value={query}
                        placeholder={m.find_query_placeholder()}
                        aria-label={m.find_query_placeholder()}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            lastMatchRef.current = null;
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                runFind(event.shiftKey ? -1 : 1);
                            }
                            if (event.key === "Escape") {
                                event.preventDefault();
                                close();
                            }
                        }}
                    />
                    <IconButton
                        type="button"
                        aria-expanded={showReplace}
                        aria-label={
                            showReplace
                                ? m.find_hide_replace()
                                : m.find_show_replace()
                        }
                        title={
                            showReplace
                                ? m.find_hide_replace()
                                : m.find_show_replace()
                        }
                        className={
                            showReplace ? styles.replaceToggleExpanded : undefined
                        }
                        onClick={() => setShowReplace((value) => !value)}
                    >
                        <ChevronDown24Regular />
                    </IconButton>
                </div>
                <div className={styles.trailing}>
                    {status ? (
                        <span className={styles.status}>{status}</span>
                    ) : null}
                    <IconButton
                        type="button"
                        aria-label={m.find_previous()}
                        title={m.find_previous()}
                        onClick={() => runFind(-1)}
                    >
                        <ChevronLeft24Regular />
                    </IconButton>
                    <IconButton
                        type="button"
                        aria-label={m.find_next()}
                        title={m.find_next()}
                        onClick={() => runFind(1)}
                    >
                        <ChevronRight24Regular />
                    </IconButton>
                    <IconButton
                        type="button"
                        aria-label={m.find_close()}
                        title={m.find_close()}
                        onClick={close}
                    >
                        <Dismiss24Regular />
                    </IconButton>
                </div>
            </div>
            {showReplace ? (
                <div className={styles.replaceRow}>
                    <TextInput
                        variant="compact"
                        className={`${styles.compactInput} ${styles.replaceField}`}
                        fullWidth
                        value={replacement}
                        placeholder={m.find_replace_placeholder()}
                        aria-label={m.find_replace_placeholder()}
                        onChange={(event) => setReplacement(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                replaceCurrent();
                            }
                            if (event.key === "Escape") {
                                event.preventDefault();
                                close();
                            }
                        }}
                    />
                    <div className={styles.replaceActions}>
                        <Button
                            type="button"
                            size="small"
                            variant="secondary"
                            onClick={replaceCurrent}
                        >
                            {m.find_replace()}
                        </Button>
                        <Button
                            type="button"
                            size="small"
                            variant="secondary"
                            onClick={replaceAll}
                        >
                            {m.find_replace_all()}
                        </Button>
                    </div>
                </div>
            ) : null}
        </div>
    );
});

FindBar.displayName = "FindBar";
