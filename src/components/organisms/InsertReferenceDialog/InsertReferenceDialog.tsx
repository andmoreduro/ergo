import {
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
    type ReactNode,
} from "react";
import type { DocumentResources } from "../../../bindings/DocumentResources";
import type { ReferenceEntry } from "../../../bindings/ReferenceEntry";
import type { ResourceEntry } from "../../../bindings/ResourceEntry";
import { formatReferenceCitation } from "../../../bibliography/biblatex";
import type { TargetedOutlineEntry } from "../../../editor/outlineMatching";
import type { ResourcePreviewRevisions } from "../../../hooks/useCompiler";
import { MenuItemButton } from "../../atoms/MenuItemButton/MenuItemButton";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { Dialog } from "../../molecules/Dialog/Dialog";
import { ResourcePreviewPanel } from "../../molecules/ResourcePreview/ResourcePreview";
import { m } from "../../../paraglide/messages.js";
import { filterReferenceItems } from "./insertReferenceSearch";
import { moveReferenceHighlight } from "./insertReferenceListKeyboard";
import styles from "./InsertReferenceDialog.module.css";

export type ReferencePick = {
    referenceId: string;
    label: string;
};

export interface InsertReferenceDialogProps {
    open: boolean;
    resources: DocumentResources | null;
    references: ReferenceEntry[];
    outlineEntries: TargetedOutlineEntry[];
    resourcePreviewRevisions: ResourcePreviewRevisions;
    mainPreviewPaintedRevision: number | null;
    onClose: () => void;
    onSelect: (pick: ReferencePick) => void;
}

type ReferenceListItem = {
    key: string;
    label: string;
    subtitle?: string;
    leading?: ReactNode;
    onPick: () => void;
};

type ReferenceSection = {
    id: string;
    title: string;
    items: ReferenceListItem[];
};

const resourcePreviewCanRender = (
    resourceRevision: number,
    mainPreviewPaintedRevision: number | null,
): boolean =>
    mainPreviewPaintedRevision === null
        ? resourceRevision === 0
        : resourceRevision <= mainPreviewPaintedRevision;

export const InsertReferenceDialog = ({
    open,
    resources,
    references,
    outlineEntries,
    resourcePreviewRevisions,
    mainPreviewPaintedRevision,
    onClose,
    onSelect,
}: InsertReferenceDialogProps) => {
    const listboxId = useId();
    const searchInputRef = useRef<HTMLInputElement>(null);
    const resultsRef = useRef<HTMLDivElement>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const resourceItems = useMemo(
        () =>
            (resources?.groups ?? []).flatMap((group) =>
                group.entries.map((entry: ResourceEntry) => {
                    const resourceRevision =
                        resourcePreviewRevisions[entry.id] ?? 0;
                    return {
                        key: `resource-${entry.id}`,
                        label: entry.label,
                        subtitle: group.label,
                        leading: (
                            <ResourcePreviewPanel
                                preview={entry.preview}
                                revision={resourceRevision}
                                canRender={resourcePreviewCanRender(
                                    resourceRevision,
                                    mainPreviewPaintedRevision,
                                )}
                            />
                        ),
                        onPick: () =>
                            onSelect({
                                referenceId: entry.id,
                                label: entry.label,
                            }),
                    };
                }),
            ),
        [
            mainPreviewPaintedRevision,
            onSelect,
            resourcePreviewRevisions,
            resources,
        ],
    );

    const bibliographyItems = useMemo(
        () =>
            (references ?? []).map((entry) => ({
                key: `bib-${entry.id}`,
                label: formatReferenceCitation(entry),
                subtitle: entry.citation_key,
                onPick: () =>
                    onSelect({
                        referenceId: entry.id,
                        label: formatReferenceCitation(entry),
                    }),
            })),
        [onSelect, references],
    );

    const outlineItems = useMemo(
        () =>
            (outlineEntries ?? []).flatMap((entry) => {
                const target = entry.target;
                if (!target) {
                    return [];
                }

                return [
                    {
                        key: `outline-${entry.key}`,
                        label: entry.text,
                        subtitle: m.sidebar_outline_page({ page: entry.page }),
                        onPick: () =>
                            onSelect({
                                referenceId: target.elementId,
                                label: entry.text,
                            }),
                    },
                ];
            }),
        [onSelect, outlineEntries],
    );

    useEffect(() => {
        if (!open) {
            setSearchQuery("");
            setHighlightedIndex(0);
        }
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const frame = requestAnimationFrame(() => {
            searchInputRef.current?.focus();
            searchInputRef.current?.select();
        });
        return () => cancelAnimationFrame(frame);
    }, [open]);

    const sections = useMemo((): ReferenceSection[] => {
        const next: ReferenceSection[] = [];
        const filteredResources = filterReferenceItems(
            resourceItems,
            searchQuery,
        );
        const filteredBibliography = filterReferenceItems(
            bibliographyItems,
            searchQuery,
        );
        const filteredOutline = filterReferenceItems(outlineItems, searchQuery);

        if (resourceItems.length > 0 && filteredResources.length > 0) {
            next.push({
                id: "resources",
                title: m.insert_reference_tab_resources(),
                items: filteredResources,
            });
        }
        if (bibliographyItems.length > 0 && filteredBibliography.length > 0) {
            next.push({
                id: "bibliography",
                title: m.insert_reference_tab_bibliography(),
                items: filteredBibliography,
            });
        }
        if (outlineItems.length > 0 && filteredOutline.length > 0) {
            next.push({
                id: "outline",
                title: m.insert_reference_tab_outline(),
                items: filteredOutline,
            });
        }
        return next;
    }, [
        bibliographyItems,
        outlineItems,
        resourceItems,
        searchQuery,
    ]);

    const flatItems = useMemo(
        () => sections.flatMap((section) => section.items),
        [sections],
    );

    useEffect(() => {
        setHighlightedIndex(0);
    }, [searchQuery]);

    useEffect(() => {
        setHighlightedIndex((current) =>
            moveReferenceHighlight(current, 0, flatItems.length),
        );
    }, [flatItems.length]);

    useEffect(() => {
        if (!open || flatItems.length === 0) {
            return;
        }
        const option = document.getElementById(
            `${listboxId}-option-${highlightedIndex}`,
        );
        option?.scrollIntoView({ block: "nearest" });
    }, [flatItems.length, highlightedIndex, listboxId, open]);

    const hasAnyItems =
        resourceItems.length > 0 ||
        bibliographyItems.length > 0 ||
        outlineItems.length > 0;

    const hasSearchResults = sections.length > 0;

    const moveHighlight = (delta: number) => {
        setHighlightedIndex((current) =>
            moveReferenceHighlight(current, delta, flatItems.length),
        );
    };

    const pickHighlighted = () => {
        const item = flatItems[highlightedIndex];
        if (item) {
            item.onPick();
        }
    };

    const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (flatItems.length === 0) {
            return;
        }

        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                moveHighlight(1);
                break;
            case "ArrowUp":
                event.preventDefault();
                moveHighlight(-1);
                break;
            case "Tab":
                event.preventDefault();
                moveHighlight(event.shiftKey ? -1 : 1);
                break;
            case "Enter":
                event.preventDefault();
                event.stopPropagation();
                pickHighlighted();
                break;
            default:
                break;
        }
    };

    const activeOptionId =
        flatItems.length > 0
            ? `${listboxId}-option-${highlightedIndex}`
            : undefined;

    if (!open) {
        return null;
    }

    return (
        <Dialog
            size="md"
            title={m.insert_reference_dialog_title()}
            titleId="insert-reference-title"
            cancelAction={{
                label: m.insert_reference_dialog_close(),
                onClick: onClose,
            }}
        >
            {!hasAnyItems ? (
                <p className={styles.empty}>{m.insert_reference_dialog_empty()}</p>
            ) : (
                <div className={styles.shell}>
                    <TextInput
                        ref={searchInputRef}
                        fullWidth
                        type="search"
                        label={m.insert_reference_search_placeholder()}
                        placeholder={m.insert_reference_search_placeholder()}
                        value={searchQuery}
                        role="combobox"
                        autoComplete="off"
                        aria-autocomplete="list"
                        aria-expanded={hasSearchResults}
                        aria-controls={hasSearchResults ? listboxId : undefined}
                        aria-activedescendant={activeOptionId}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        onKeyDown={handleSearchKeyDown}
                    />
                    <div
                        ref={resultsRef}
                        id={hasSearchResults ? listboxId : undefined}
                        className={styles.results}
                        role={hasSearchResults ? "listbox" : undefined}
                        aria-label={
                            hasSearchResults
                                ? m.insert_reference_search_placeholder()
                                : undefined
                        }
                    >
                        {hasSearchResults ? (
                            (() => {
                                let flatIndex = 0;
                                return sections.map((section) => (
                                    <section
                                        key={section.id}
                                        className={styles.section}
                                        aria-labelledby={`insert-reference-section-${section.id}`}
                                    >
                                        <h3
                                            id={`insert-reference-section-${section.id}`}
                                            className={styles.sectionTitle}
                                        >
                                            {section.title}
                                        </h3>
                                        <ul className={styles.list}>
                                            {section.items.map((item) => {
                                                const index = flatIndex;
                                                flatIndex += 1;
                                                const optionId = `${listboxId}-option-${index}`;
                                                const highlighted =
                                                    index === highlightedIndex;
                                                return (
                                                    <li
                                                        key={item.key}
                                                        role="presentation"
                                                    >
                                                        <MenuItemButton
                                                            id={optionId}
                                                            role="option"
                                                            variant="listPicker"
                                                            aria-selected={
                                                                highlighted
                                                            }
                                                            className={
                                                                highlighted
                                                                    ? styles.listItemHighlighted
                                                                    : ""
                                                            }
                                                            onMouseEnter={() =>
                                                                setHighlightedIndex(
                                                                    index,
                                                                )
                                                            }
                                                            onClick={item.onPick}
                                                        >
                                                            {item.leading ? (
                                                                <div
                                                                    className={
                                                                        styles.resourcePreviewSlot
                                                                    }
                                                                >
                                                                    {item.leading}
                                                                </div>
                                                            ) : null}
                                                            <span>
                                                                {item.label}
                                                            </span>
                                                            {item.subtitle ? (
                                                                <small>
                                                                    {
                                                                        item.subtitle
                                                                    }
                                                                </small>
                                                            ) : null}
                                                        </MenuItemButton>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </section>
                                ));
                            })()
                        ) : (
                            <p className={styles.empty}>
                                {m.insert_reference_search_no_results()}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </Dialog>
    );
};
