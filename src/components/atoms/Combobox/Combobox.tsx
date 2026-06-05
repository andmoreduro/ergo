import {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from "react";
import { FieldLabel, type FieldImportance } from "../FieldLabel/FieldLabel";
import styles from "./Combobox.module.css";

export interface ComboboxProps {
    /** Currently selected value. */
    value: string;
    /** Called with the chosen option when the selection changes. */
    onChange: (value: string) => void;
    /** Selectable options (already in display order). */
    options: string[];
    /** Optional label rendered above the control. */
    label?: string;
    importance?: FieldImportance;
    /** Placeholder shown while searching / when empty. */
    placeholder?: string;
    /** Text shown when the filter matches no options. */
    noResultsLabel?: string;
    disabled?: boolean;
    /** When false, the control behaves like a select (no type-to-filter). */
    filterable?: boolean;
    /** Highlights the trigger border as invalid. */
    error?: boolean;
    /** Span the full width of the container. */
    fullWidth?: boolean;
    id?: string;
    "aria-label"?: string;
}

/**
 * Searchable select. Combines a text input with a filterable listbox — what a
 * native `<select>` (the {@link Select} atom) cannot do. Shares the visual
 * styling of `Select` but uses `role="combobox"` + `role="listbox"` semantics.
 */
export const Combobox = ({
    value,
    onChange,
    options,
    label,
    importance,
    placeholder,
    noResultsLabel,
    disabled = false,
    filterable = true,
    error = false,
    fullWidth = false,
    id,
    "aria-label": ariaLabel,
}: ComboboxProps) => {
    const generatedId = useId();
    const controlId = id ?? generatedId;
    const listboxId = `${controlId}-listbox`;

    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [highlighted, setHighlighted] = useState(0);

    const filtered = useMemo(() => {
        if (!filterable) {
            return options;
        }
        const needle = query.trim().toLowerCase();
        if (!needle) {
            return options;
        }
        return options.filter((option) =>
            option.toLowerCase().includes(needle),
        );
    }, [filterable, query, options]);

    const closeDropdown = useCallback(() => {
        setOpen(false);
        setQuery("");
    }, []);

    const commit = useCallback(
        (option: string) => {
            onChange(option);
            closeDropdown();
        },
        [onChange, closeDropdown],
    );

    const openDropdown = useCallback(() => {
        if (disabled) {
            return;
        }
        setOpen(true);
        setQuery("");
        const current = options.indexOf(value);
        setHighlighted(current >= 0 ? current : 0);
    }, [disabled, options, value]);

    // Close on outside click (same pattern as DropdownMenu).
    useEffect(() => {
        if (!open) {
            return;
        }
        const handlePointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                closeDropdown();
            }
        };
        window.addEventListener("mousedown", handlePointerDown);
        return () => window.removeEventListener("mousedown", handlePointerDown);
    }, [open, closeDropdown]);

    // Keep the highlighted option scrolled into view.
    useEffect(() => {
        if (!open) {
            return;
        }
        const list = listRef.current;
        const node = list?.children[highlighted] as HTMLElement | undefined;
        node?.scrollIntoView?.({ block: "nearest" });
    }, [open, highlighted]);

    const moveHighlight = (delta: number) => {
        setHighlighted((current) => {
            if (filtered.length === 0) {
                return 0;
            }
            const next = current + delta;
            if (next < 0) {
                return 0;
            }
            if (next > filtered.length - 1) {
                return filtered.length - 1;
            }
            return next;
        });
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (!filterable && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            return;
        }

        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                if (!open) {
                    openDropdown();
                } else {
                    moveHighlight(1);
                }
                break;
            case "ArrowUp":
                event.preventDefault();
                if (open) {
                    moveHighlight(-1);
                }
                break;
            case "Enter":
            case " ":
                if (event.ctrlKey || event.metaKey) {
                    break;
                }
                if (!open) {
                    event.preventDefault();
                    event.stopPropagation();
                    openDropdown();
                    break;
                }
                if (event.key === "Enter" && filtered[highlighted]) {
                    event.preventDefault();
                    commit(filtered[highlighted]);
                }
                break;
            case "Escape":
                if (open) {
                    // Swallow so the surrounding dialog does not also close.
                    event.preventDefault();
                    event.stopPropagation();
                    closeDropdown();
                }
                break;
            case "Tab":
                if (open) {
                    closeDropdown();
                }
                break;
            default:
                break;
        }
    };

    const containerClassNames = [
        styles.container,
        fullWidth ? styles.fullWidth : "",
    ]
        .filter(Boolean)
        .join(" ");

    const inputClassNames = [
        styles.input,
        !filterable ? styles.inputSelect : "",
        error ? styles.inputError : "",
        disabled ? styles.disabled : "",
    ]
        .filter(Boolean)
        .join(" ");

    const activeOptionId =
        open && filtered[highlighted]
            ? `${listboxId}-option-${highlighted}`
            : undefined;

    return (
        <div className={containerClassNames} ref={rootRef}>
            {label && (
                <FieldLabel htmlFor={controlId} importance={importance}>
                    {label}
                </FieldLabel>
            )}
            <div className={styles.inputWrapper}>
                <input
                    ref={inputRef}
                    id={controlId}
                    className={inputClassNames}
                    type="text"
                    role="combobox"
                    autoComplete="off"
                    spellCheck={false}
                    readOnly={!filterable}
                    disabled={disabled}
                    placeholder={placeholder}
                    aria-label={ariaLabel}
                    aria-invalid={error || undefined}
                    aria-expanded={open}
                    aria-controls={listboxId}
                    aria-autocomplete={filterable ? "list" : "none"}
                    aria-activedescendant={activeOptionId}
                    value={open && filterable ? query : value}
                    onChange={(event) => {
                        if (!filterable) {
                            return;
                        }
                        setQuery(event.target.value);
                        setOpen(true);
                        setHighlighted(0);
                    }}
                    onMouseDown={() => {
                        if (!open) {
                            openDropdown();
                        }
                    }}
                    onKeyDown={handleKeyDown}
                />
                <div className={styles.chevron} aria-hidden="true">
                    <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M3 4.5L6 7.5L9 4.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>
                {open && (
                    <ul
                        ref={listRef}
                        id={listboxId}
                        className={styles.listbox}
                        role="listbox"
                        aria-label={ariaLabel ?? label}
                    >
                        {filtered.length === 0 ? (
                            <li className={styles.empty} aria-disabled="true">
                                {noResultsLabel}
                            </li>
                        ) : (
                            filtered.map((option, index) => {
                                const optionClassNames = [
                                    styles.option,
                                    index === highlighted ? styles.highlighted : "",
                                    option === value ? styles.selected : "",
                                ]
                                    .filter(Boolean)
                                    .join(" ");
                                return (
                                    <li
                                        key={option}
                                        id={`${listboxId}-option-${index}`}
                                        className={optionClassNames}
                                        role="option"
                                        aria-selected={option === value}
                                        onMouseEnter={() => setHighlighted(index)}
                                        onMouseDown={(event) =>
                                            event.preventDefault()
                                        }
                                        onClick={() => commit(option)}
                                    >
                                        {option}
                                    </li>
                                );
                            })
                        )}
                    </ul>
                )}
            </div>
        </div>
    );
};
