import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type KeyboardEvent,
} from "react";
import { FieldLabel, type FieldImportance } from "../../atoms/FieldLabel/FieldLabel";
import { useEditorFieldBinding } from "../../../state/EditorFieldRegistry";
import {
    projectInputElementId,
    projectInputFieldId,
    simpleListComposerFieldId,
} from "../../../editor/fieldIds";
import { normalizeEditableText } from "../../../editor/textInput";
import { useEditorNavigation } from "../../../editor/EditorNavigationContext";
import styles from "./SimpleListField.module.css";

export type SimpleListItemKind = "string" | "content";

export interface SimpleListFieldProps {
    path: string;
    label: string;
    importance?: FieldImportance;
    itemKind: SimpleListItemKind;
    items: string[];
    onChange: (items: string[]) => void;
    onAdvance?: () => void;
}

type EditTarget =
    | { kind: "compose" }
    | { kind: "item"; index: number };

const EditingPill = ({
    path,
    index,
    draft,
    onDraftChange,
    onKeyDown,
    onBlur,
}: {
    path: string;
    index: number;
    draft: string;
    onDraftChange: (next: string) => void;
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
    onBlur: () => void;
}) => {
    const fieldBinding = useEditorFieldBinding<HTMLInputElement>({
        elementId: projectInputElementId,
        fieldId: projectInputFieldId(`${path}/${index}`),
    });

    return (
        <span className={`${styles.chip} ${styles.chipCommitted} ${styles.chipEditing}`}>
            <input
                {...fieldBinding}
                autoFocus
                className={styles.chipInput}
                type="text"
                value={draft}
                onBlur={onBlur}
                onChange={(event) =>
                    onDraftChange(normalizeEditableText(event.target.value))
                }
                onKeyDown={onKeyDown}
            />
        </span>
    );
};

export const SimpleListField = ({
    path,
    label,
    importance,
    itemKind,
    items,
    onChange,
    onAdvance,
}: SimpleListFieldProps) => {
    const [editTarget, setEditTarget] = useState<EditTarget>({ kind: "compose" });
    const [draft, setDraft] = useState("");
    const [chipFocus, setChipFocus] = useState<number | null>(null);
    const composeInputRef = useRef<HTMLInputElement | null>(null);
    const chipButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const [composingNewEntry, setComposingNewEntry] = useState(false);
    const { handleAdvanceKeyDown } = useEditorNavigation();

    const composerFieldId = simpleListComposerFieldId(path);
    const composeBinding = useEditorFieldBinding<HTMLInputElement>({
        elementId: projectInputElementId,
        fieldId: composerFieldId,
    });

    const focusComposeInput = useCallback(() => {
        setChipFocus(null);
        setEditTarget({ kind: "compose" });
        requestAnimationFrame(() => composeInputRef.current?.focus());
    }, []);

    const syncComposeDraft = useCallback(
        (text: string) => {
            const normalized = normalizeEditableText(text);
            if (!normalized.trim()) {
                if (composingNewEntry) {
                    setComposingNewEntry(false);
                    onChange(items.slice(0, -1));
                }
                return;
            }

            if (!composingNewEntry) {
                setComposingNewEntry(true);
                onChange([...items, normalized]);
                return;
            }

            onChange([...items.slice(0, -1), normalized]);
        },
        [composingNewEntry, items, onChange],
    );

    const finalizeComposeEntry = useCallback(() => {
        if (!composingNewEntry || items.length === 0) {
            setComposingNewEntry(false);
            return;
        }

        const updated = [...items];
        const lastIndex = updated.length - 1;
        const finalized = normalizeEditableText(updated[lastIndex] ?? "").trim();
        if (finalized) {
            updated[lastIndex] = finalized;
            onChange(updated);
        } else {
            onChange(items.slice(0, lastIndex));
        }
        setComposingNewEntry(false);
    }, [composingNewEntry, items, onChange]);

    const finishEditing = useCallback(
        (advance = false) => {
            if (editTarget.kind === "compose") {
                finalizeComposeEntry();
            }
            setDraft("");
            setEditTarget({ kind: "compose" });
            if (advance) {
                onAdvance?.();
            }
        },
        [editTarget, finalizeComposeEntry, onAdvance],
    );

    const startEditingItem = useCallback((index: number) => {
        setChipFocus(null);
        setEditTarget({ kind: "item", index });
        setDraft(items[index] ?? "");
    }, [items]);

    const updateDraft = useCallback(
        (next: string) => {
            setDraft(next);
            if (editTarget.kind !== "item") {
                return;
            }
            const updated = [...items];
            updated[editTarget.index] = next;
            onChange(updated);
        },
        [editTarget, items, onChange],
    );

    const stopEditingItem = useCallback(() => {
        if (editTarget.kind !== "item") {
            return;
        }
        const normalized = normalizeEditableText(draft).trim();
        if (!normalized) {
            onChange(items.filter((_, index) => index !== editTarget.index));
        }
        setDraft("");
        setEditTarget({ kind: "compose" });
    }, [draft, editTarget, items, onChange]);

    const removeLastItem = useCallback(() => {
        if (items.length === 0) {
            return;
        }
        const lastIndex = items.length - 1;
        const lastValue = items[lastIndex] ?? "";
        setComposingNewEntry(false);
        onChange(items.slice(0, lastIndex));
        setEditTarget({ kind: "compose" });
        setDraft(lastValue);
        requestAnimationFrame(() => composeInputRef.current?.focus());
    }, [items, onChange]);

    const handleComposeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (draft.trim()) {
                finishEditing(false);
            } else {
                onAdvance?.();
            }
            return;
        }

        if (event.key === "Backspace" && draft.length === 0 && items.length > 0) {
            event.preventDefault();
            removeLastItem();
            return;
        }

        if (
            event.key === "ArrowLeft" &&
            event.currentTarget.selectionStart === 0 &&
            items.length > 0
        ) {
            event.preventDefault();
            setChipFocus(items.length - 1);
            composeInputRef.current?.blur();
            return;
        }

        handleAdvanceKeyDown(event, composerFieldId);
    };

    const handleItemKeyDown = (
        event: KeyboardEvent<HTMLInputElement>,
        index: number,
    ) => {
        const fieldId = projectInputFieldId(`${path}/${index}`);

        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            finishEditing(false);
            focusComposeInput();
            return;
        }

        if (event.key === "Backspace" && draft.length === 0) {
            event.preventDefault();
            onChange(items.filter((_, itemIndex) => itemIndex !== index));
            setEditTarget({ kind: "compose" });
            setDraft("");
            if (index > 0) {
                setChipFocus(index - 1);
            } else {
                focusComposeInput();
            }
            return;
        }

        handleAdvanceKeyDown(event, fieldId);
    };

    const handleChipKeyDown = (
        event: KeyboardEvent<HTMLButtonElement>,
        index: number,
    ) => {
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            if (index > 0) {
                setChipFocus(index - 1);
            }
            return;
        }

        if (event.key === "ArrowRight") {
            event.preventDefault();
            if (index < items.length - 1) {
                setChipFocus(index + 1);
            } else {
                focusComposeInput();
            }
            return;
        }

        if (event.key === "Backspace") {
            event.preventDefault();
            onChange(items.filter((_, itemIndex) => itemIndex !== index));
            if (index > 0) {
                setChipFocus(index - 1);
            } else if (items.length > 1) {
                setChipFocus(0);
            } else {
                focusComposeInput();
            }
            return;
        }

        if (
            event.key.length === 1 &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
        ) {
            event.preventDefault();
            setEditTarget({ kind: "compose" });
            setDraft(event.key);
            setChipFocus(null);
            requestAnimationFrame(() => composeInputRef.current?.focus());
        }
    };

    const isComposing = editTarget.kind === "compose";
    const showComposePill = isComposing && draft.length > 0;
    const visibleItems =
        composingNewEntry && items.length > 0 ? items.slice(0, -1) : items;

    useEffect(() => {
        if (showComposePill) {
            composeInputRef.current?.focus();
        }
    }, [showComposePill]);

    useEffect(() => {
        if (chipFocus === null) {
            return;
        }
        chipButtonRefs.current[chipFocus]?.focus();
    }, [chipFocus]);

    if (itemKind !== "string") {
        return null;
    }

    return (
        <div className={styles.field}>
            <FieldLabel importance={importance}>{label}</FieldLabel>
            <div
                className={styles.inlineComposer}
                onMouseDown={(event) => {
                    if (event.target === event.currentTarget) {
                        focusComposeInput();
                    }
                }}
            >
                {visibleItems.map((item, index) => {
                    const isEditing =
                        editTarget.kind === "item" && editTarget.index === index;

                    if (isEditing) {
                        return (
                            <EditingPill
                                draft={draft}
                                index={index}
                                key={`${path}-${index}`}
                                path={path}
                                onBlur={stopEditingItem}
                                onDraftChange={updateDraft}
                                onKeyDown={(event) => handleItemKeyDown(event, index)}
                            />
                        );
                    }

                    const isChipFocused = chipFocus === index;

                    return (
                        <button
                            className={`${styles.chip} ${styles.chipCommitted}${
                                isChipFocused ? ` ${styles.chipFocused}` : ""
                            }`}
                            key={`${path}-${index}`}
                            ref={(node) => {
                                chipButtonRefs.current[index] = node;
                            }}
                            tabIndex={isChipFocused ? 0 : -1}
                            type="button"
                            onKeyDown={(event) => handleChipKeyDown(event, index)}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                startEditingItem(index);
                            }}
                        >
                            <span className={styles.chipLabel}>{item}</span>
                        </button>
                    );
                })}

                {showComposePill ? (
                    <span className={`${styles.chip} ${styles.chipCommitted} ${styles.chipEditing}`}>
                        <input
                            {...composeBinding}
                            ref={(node) => {
                                composeBinding.ref(node);
                                composeInputRef.current = node;
                            }}
                            className={styles.chipInput}
                            type="text"
                            value={draft}
                            onChange={(event) => {
                                const next = normalizeEditableText(event.target.value);
                                setDraft(next);
                                syncComposeDraft(next);
                            }}
                            onKeyDown={handleComposeKeyDown}
                        />
                    </span>
                ) : (
                    <input
                        {...composeBinding}
                        ref={(node) => {
                            composeBinding.ref(node);
                            composeInputRef.current = node;
                        }}
                        aria-label={label}
                        className={styles.inlineInput}
                        placeholder={label}
                        type="text"
                        value=""
                        onFocus={() => {
                            setChipFocus(null);
                            setEditTarget({ kind: "compose" });
                        }}
                        onChange={(event) => {
                            const next = normalizeEditableText(event.target.value);
                            setEditTarget({ kind: "compose" });
                            setDraft(next);
                            syncComposeDraft(next);
                        }}
                        onKeyDown={handleComposeKeyDown}
                    />
                )}
            </div>
        </div>
    );
};
