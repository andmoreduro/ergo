import { useEffect, useMemo, useState, type ReactNode } from "react";
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
    const [searchQuery, setSearchQuery] = useState("");

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
                        label: entry.citation_key,
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
        }
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

    const hasAnyItems =
        resourceItems.length > 0 ||
        bibliographyItems.length > 0 ||
        outlineItems.length > 0;

    const hasSearchResults = sections.length > 0;

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
                        fullWidth
                        type="search"
                        label={m.insert_reference_search_placeholder()}
                        placeholder={m.insert_reference_search_placeholder()}
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                    />
                    <div className={styles.results}>
                        {hasSearchResults ? (
                            sections.map((section) => (
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
                                    <ReferenceList items={section.items} />
                                </section>
                            ))
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

const ReferenceList = ({ items }: { items: ReferenceListItem[] }) => (
    <ul className={styles.list}>
        {items.map((item) => (
            <li key={item.key}>
                <MenuItemButton variant="listPicker" onClick={item.onPick}>
                    {item.leading ? (
                        <div className={styles.resourcePreviewSlot}>
                            {item.leading}
                        </div>
                    ) : null}
                    <span>{item.label}</span>
                    {item.subtitle ? <small>{item.subtitle}</small> : null}
                </MenuItemButton>
            </li>
        ))}
    </ul>
);
