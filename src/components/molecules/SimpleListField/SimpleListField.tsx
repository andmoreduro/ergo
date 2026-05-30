import {
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
    type KeyboardEvent,
    type RefCallback,
} from "react";
import type { RichText } from "../../../bindings/RichText";
import { FieldLabel, type FieldImportance } from "../../atoms/FieldLabel/FieldLabel";
import { InlineTextInput } from "../../atoms/InlineTextInput/InlineTextInput";
import { RichTextField } from "../RichTextField/RichTextField";
import { useEditorFieldBinding } from "../../../state/EditorFieldRegistry";
import {
    projectInputElementId,
    projectInputFieldId,
    simpleListComposerFieldId,
} from "../../../editor/fieldIds";
import {
    emptySimpleListContentItem,
    isSimpleListContentEmpty,
    normalizeSimpleListContentItem,
} from "../../../editor/simpleListContent";
import { normalizeEditableText, normalizeRichTextContent } from "../../../editor/textInput";
import { useEditorNavigation } from "../../../editor/EditorNavigationContext";
import { placeCaretAtEnd } from "../../../richText/richText";
import styles from "./SimpleListField.module.css";

const focusBootstrappedEntry = (
    node: HTMLInputElement | HTMLDivElement | null,
) => {
    if (!node) {
        return;
    }

    node.focus();

    if (node instanceof HTMLInputElement) {
        const length = node.value.length;
        node.setSelectionRange(length, length);
        return;
    }

    placeCaretAtEnd(node);
};

export type SimpleListItemKind = "string" | "content";

type SimpleListFieldBaseProps = {
    path: string;
    label: string;
    importance?: FieldImportance;
    onAdvance?: () => void;
};

export type SimpleListFieldProps = SimpleListFieldBaseProps &
    (
        | {
              itemKind: "string";
              items: string[];
              onChange: (items: string[]) => void;
          }
        | {
              itemKind: "content";
              items: RichText[][];
              onChange: (items: RichText[][]) => void;
          }
    );

const InlineStringEntry = ({
    path,
    index,
    value,
    entryRef,
    onChange,
    onRemove,
    onEnter,
}: {
    path: string;
    index: number;
    value: string;
    entryRef: RefCallback<HTMLInputElement>;
    onChange: (next: string) => void;
    onRemove: () => void;
    onEnter: () => void;
}) => {
    const fieldId = projectInputFieldId(`${path}/${index}`);
    const fieldBinding = useEditorFieldBinding<HTMLInputElement>({
        elementId: projectInputElementId,
        fieldId,
    });
    const { handleAdvanceKeyDown } = useEditorNavigation();

    return (
        <span className={`${styles.chip} ${styles.chipCommitted}`}>
            <InlineTextInput
                {...fieldBinding}
                ref={(node) => {
                    fieldBinding.ref(node);
                    entryRef(node);
                }}
                variant="chip"
                type="text"
                value={value}
                onBlur={(event) => {
                    fieldBinding.onBlur(event);
                    if (!value.trim()) {
                        onRemove();
                    }
                }}
                onChange={(event) =>
                    onChange(normalizeEditableText(event.target.value))
                }
                onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        onEnter();
                        return;
                    }

                    if (
                        event.key === "Backspace" &&
                        value.length === 0
                    ) {
                        event.preventDefault();
                        onRemove();
                        return;
                    }

                    handleAdvanceKeyDown(event, fieldId);
                }}
            />
        </span>
    );
};

const InlineContentEntry = ({
    path,
    index,
    content,
    entryRef,
    onChange,
    onRemove,
    onEnter,
}: {
    path: string;
    index: number;
    content: RichText[];
    entryRef: RefCallback<HTMLDivElement>;
    onChange: (next: RichText[]) => void;
    onRemove: () => void;
    onEnter: () => void;
}) => {
    const fieldId = projectInputFieldId(`${path}/${index}`);
    const fieldBinding = useEditorFieldBinding<HTMLDivElement>({
        elementId: projectInputElementId,
        fieldId,
    });
    const { handleAdvanceKeyDown } = useEditorNavigation();

    return (
        <span className={`${styles.chip} ${styles.chipCommitted}`}>
            <div className={styles.chipContentEditor}>
                <RichTextField
                    content={content}
                    fieldBinding={{
                        ...fieldBinding,
                        ref: (node) => {
                            fieldBinding.ref(node);
                            entryRef(node);
                        },
                    }}
                    variant="document"
                    onBlur={(event) => {
                        fieldBinding.onBlur(event);
                        if (isSimpleListContentEmpty(content)) {
                            onRemove();
                        }
                    }}
                    onChange={(next) =>
                        onChange(normalizeSimpleListContentItem(next))
                    }
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            onEnter();
                            return;
                        }

                        if (
                            event.key === "Backspace" &&
                            isSimpleListContentEmpty(content)
                        ) {
                            event.preventDefault();
                            onRemove();
                            return;
                        }

                        handleAdvanceKeyDown(event, fieldId);
                    }}
                />
            </div>
        </span>
    );
};

const SimpleListStringField = ({
    path,
    label,
    importance,
    items,
    onChange,
    onAdvance,
}: SimpleListFieldBaseProps & {
    items: string[];
    onChange: (items: string[]) => void;
}) => {
    const composeInputRef = useRef<HTMLInputElement | null>(null);
    const entryRefs = useRef<(HTMLInputElement | null)[]>([]);
    const pendingFocusIndexRef = useRef<number | null>(null);
    const pendingFocusComposerRef = useRef(false);
    const composerBootstrappingRef = useRef(false);
    const { handleAdvanceKeyDown } = useEditorNavigation();

    const composerFieldId = simpleListComposerFieldId(path);
    const composeBinding = useEditorFieldBinding<HTMLInputElement>({
        elementId: projectInputElementId,
        fieldId: composerFieldId,
    });

    const focusComposer = useCallback(() => {
        requestAnimationFrame(() => {
            focusBootstrappedEntry(composeInputRef.current ?? null);
        });
    }, []);

    const focusComposerAfterListChange = useCallback(() => {
        pendingFocusComposerRef.current = true;
    }, []);

    const focusEntry = useCallback((index: number) => {
        requestAnimationFrame(() => {
            focusBootstrappedEntry(entryRefs.current[index] ?? null);
        });
    }, []);

    useLayoutEffect(() => {
        if (pendingFocusComposerRef.current) {
            pendingFocusComposerRef.current = false;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    focusBootstrappedEntry(composeInputRef.current ?? null);
                });
            });
            return;
        }

        if (pendingFocusIndexRef.current === null) {
            return;
        }

        const focusIndex = pendingFocusIndexRef.current;
        pendingFocusIndexRef.current = null;
        composerBootstrappingRef.current = false;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                focusBootstrappedEntry(entryRefs.current[focusIndex] ?? null);
            });
        });
    }, [items.length]);

    const bootstrapNewEntry = useCallback(
        (text: string) => {
            if (composerBootstrappingRef.current) {
                return;
            }

            const normalized = normalizeEditableText(text);
            if (!normalized.trim()) {
                return;
            }

            const newIndex = items.length;
            composerBootstrappingRef.current = true;
            pendingFocusIndexRef.current = newIndex;
            onChange([...items, normalized]);
        },
        [items, onChange],
    );

    const updateItem = useCallback(
        (index: number, next: string) => {
            const updated = [...items];
            updated[index] = next;
            onChange(updated);
        },
        [items, onChange],
    );

    const removeItem = useCallback(
        (index: number) => {
            onChange(items.filter((_, itemIndex) => itemIndex !== index));
            focusComposerAfterListChange();
        },
        [focusComposerAfterListChange, onChange],
    );

    const removeLastItem = useCallback(() => {
        if (items.length === 0) {
            return;
        }

        onChange(items.slice(0, items.length - 1));
        focusComposerAfterListChange();
    }, [focusComposerAfterListChange, items, onChange]);

    const handleComposeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onAdvance?.();
            return;
        }

        if (event.key === "Backspace") {
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
            focusEntry(items.length - 1);
            return;
        }

        handleAdvanceKeyDown(event, composerFieldId);
    };

    return (
        <div className={styles.field}>
            <FieldLabel importance={importance}>{label}</FieldLabel>
            <div
                className={styles.inlineComposer}
                onMouseDown={(event) => {
                    if (event.target === event.currentTarget) {
                        focusComposer();
                    }
                }}
            >
                {items.map((item, index) => (
                    <InlineStringEntry
                        entryRef={(node) => {
                            entryRefs.current[index] = node;
                        }}
                        index={index}
                        key={`${path}-${index}`}
                        path={path}
                        value={item}
                        onChange={(next) => updateItem(index, next)}
                        onEnter={focusComposer}
                        onRemove={() => removeItem(index)}
                    />
                ))}

                <InlineTextInput
                    {...composeBinding}
                    ref={(node) => {
                        composeBinding.ref(node);
                        composeInputRef.current = node;
                    }}
                    aria-label={label}
                    variant="inlineComposer"
                    placeholder={label}
                    type="text"
                    value=""
                    onChange={(event) => bootstrapNewEntry(event.target.value)}
                    onKeyDown={handleComposeKeyDown}
                />
            </div>
        </div>
    );
};

const SimpleListContentField = ({
    path,
    label,
    importance,
    items,
    onChange,
    onAdvance,
}: SimpleListFieldBaseProps & {
    items: RichText[][];
    onChange: (items: RichText[][]) => void;
}) => {
    const [composerKey, setComposerKey] = useState(0);
    const composeEditorRef = useRef<HTMLDivElement | null>(null);
    const entryRefs = useRef<(HTMLDivElement | null)[]>([]);
    const pendingFocusIndexRef = useRef<number | null>(null);
    const pendingFocusComposerRef = useRef(false);
    const composerBootstrappingRef = useRef(false);
    const { handleAdvanceKeyDown } = useEditorNavigation();

    const composerFieldId = simpleListComposerFieldId(path);
    const composeBinding = useEditorFieldBinding<HTMLDivElement>({
        elementId: projectInputElementId,
        fieldId: composerFieldId,
    });

    const focusComposer = useCallback(() => {
        requestAnimationFrame(() => {
            focusBootstrappedEntry(composeEditorRef.current ?? null);
        });
    }, []);

    const focusComposerAfterListChange = useCallback(() => {
        pendingFocusComposerRef.current = true;
    }, []);

    useLayoutEffect(() => {
        if (pendingFocusComposerRef.current) {
            pendingFocusComposerRef.current = false;
            setComposerKey((current) => current + 1);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    focusBootstrappedEntry(composeEditorRef.current ?? null);
                });
            });
            return;
        }

        if (pendingFocusIndexRef.current === null) {
            return;
        }

        const focusIndex = pendingFocusIndexRef.current;
        pendingFocusIndexRef.current = null;
        composerBootstrappingRef.current = false;
        setComposerKey((current) => current + 1);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                focusBootstrappedEntry(entryRefs.current[focusIndex] ?? null);
            });
        });
    }, [items.length]);

    const bootstrapNewEntry = useCallback(
        (content: RichText[]) => {
            if (composerBootstrappingRef.current) {
                return;
            }

            const normalized = normalizeSimpleListContentItem(content);
            if (isSimpleListContentEmpty(normalized)) {
                return;
            }

            const newIndex = items.length;
            composerBootstrappingRef.current = true;
            pendingFocusIndexRef.current = newIndex;
            onChange([...items, normalized]);
        },
        [items, onChange],
    );

    const updateItem = useCallback(
        (index: number, next: RichText[]) => {
            const updated = [...items];
            updated[index] = next;
            onChange(updated);
        },
        [items, onChange],
    );

    const removeItem = useCallback(
        (index: number) => {
            onChange(items.filter((_, itemIndex) => itemIndex !== index));
            focusComposerAfterListChange();
        },
        [focusComposerAfterListChange, onChange],
    );

    const removeLastItem = useCallback(() => {
        if (items.length === 0) {
            return;
        }

        onChange(items.slice(0, items.length - 1));
        focusComposerAfterListChange();
    }, [focusComposerAfterListChange, items, onChange]);

    const handleComposeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onAdvance?.();
            return;
        }

        if (event.key === "Backspace") {
            event.preventDefault();
            removeLastItem();
            return;
        }

        handleAdvanceKeyDown(event, composerFieldId);
    };

    return (
        <div className={styles.field}>
            <FieldLabel importance={importance}>{label}</FieldLabel>
            <div
                className={styles.inlineComposer}
                onMouseDown={(event) => {
                    if (event.target === event.currentTarget) {
                        focusComposer();
                    }
                }}
            >
                {items.map((item, index) => (
                    <InlineContentEntry
                        content={item}
                        entryRef={(node) => {
                            entryRefs.current[index] = node;
                        }}
                        index={index}
                        key={`${path}-${index}`}
                        path={path}
                        onChange={(next) => updateItem(index, next)}
                        onEnter={focusComposer}
                        onRemove={() => removeItem(index)}
                    />
                ))}

                <span aria-label={label} className={styles.composeInputHost}>
                    <div className={styles.chipContentEditor}>
                        <RichTextField
                            key={composerKey}
                            content={emptySimpleListContentItem()}
                            fieldBinding={{
                                ...composeBinding,
                                ref: (node) => {
                                    composeBinding.ref(node);
                                    composeEditorRef.current = node;
                                },
                            }}
                            variant="document"
                            onChange={(next) => {
                                bootstrapNewEntry(normalizeRichTextContent(next));
                            }}
                            onKeyDown={handleComposeKeyDown}
                        />
                    </div>
                </span>
            </div>
        </div>
    );
};

export const SimpleListField = (props: SimpleListFieldProps) => {
    if (props.itemKind === "content") {
        return <SimpleListContentField {...props} />;
    }

    return <SimpleListStringField {...props} />;
};
