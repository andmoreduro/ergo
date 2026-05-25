import { useMemo } from "react";
import type { DocumentResources } from "../../../bindings/DocumentResources";
import type { ReferenceEntry } from "../../../bindings/ReferenceEntry";
import { formatReferenceCitation } from "../../../bibliography/biblatex";
import type { TargetedOutlineEntry } from "../../layout/Sidebar/SidebarOutline";
import { Button } from "../../atoms/Button/Button";
import { m } from "../../../paraglide/messages.js";
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
    onClose: () => void;
    onSelect: (pick: ReferencePick) => void;
};

type ReferenceListItem = {
    key: string;
    label: string;
    subtitle?: string;
    onPick: () => void;
};

export const InsertReferenceDialog = ({
    open,
    resources,
    references,
    outlineEntries,
    onClose,
    onSelect,
}: InsertReferenceDialogProps) => {
    const resourceItems = useMemo(
        () =>
            (resources?.groups ?? []).flatMap((group) =>
                group.entries.map((entry) => ({
                    key: `resource-${entry.id}`,
                    label: entry.label,
                    subtitle: group.label,
                    onPick: () =>
                        onSelect({
                            referenceId: entry.id,
                            label: entry.label,
                        }),
                })),
            ),
        [onSelect, resources],
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
            (outlineEntries ?? []).map((entry) => ({
                key: `outline-${entry.key}`,
                label: entry.text,
                subtitle: m.sidebar_outline_page({ page: entry.page }),
                onPick: () =>
                    onSelect({
                        referenceId: entry.target.elementId,
                        label: entry.text,
                    }),
            })),
        [onSelect, outlineEntries],
    );

    const hasAnyItems =
        resourceItems.length > 0 ||
        bibliographyItems.length > 0 ||
        outlineItems.length > 0;

    if (!open) {
        return null;
    }

    return (
        <div
            className={styles.overlay}
            role="presentation"
            onClick={onClose}
        >
            <div
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="insert-reference-title"
                onClick={(event) => event.stopPropagation()}
            >
                <header className={styles.header}>
                    <h2 className={styles.title} id="insert-reference-title">
                        {m.insert_reference_dialog_title()}
                    </h2>
                    <Button type="button" size="small" variant="ghost" onClick={onClose}>
                        {m.insert_reference_dialog_close()}
                    </Button>
                </header>

                <div className={styles.body}>
                    {!hasAnyItems ? (
                        <p className={styles.empty}>{m.insert_reference_dialog_empty()}</p>
                    ) : (
                        <>
                            {resourceItems.length > 0 && (
                                <ReferenceSection
                                    title={m.insert_reference_tab_resources()}
                                    items={resourceItems}
                                />
                            )}
                            {bibliographyItems.length > 0 && (
                                <ReferenceSection
                                    title={m.insert_reference_tab_bibliography()}
                                    items={bibliographyItems}
                                />
                            )}
                            {outlineItems.length > 0 && (
                                <ReferenceSection
                                    title={m.insert_reference_tab_outline()}
                                    items={outlineItems}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const ReferenceSection = ({
    title,
    items,
}: {
    title: string;
    items: ReferenceListItem[];
}) => (
    <section className={styles.section}>
        <h3 className={styles.groupLabel}>{title}</h3>
        <ReferenceList items={items} />
    </section>
);

const ReferenceList = ({ items }: { items: ReferenceListItem[] }) => (
    <ul className={styles.list}>
        {items.map((item) => (
            <li key={item.key}>
                <button
                    type="button"
                    className={styles.itemButton}
                    onClick={item.onPick}
                >
                    <span>{item.label}</span>
                    {item.subtitle && (
                        <small className={styles.itemSubtitle}>{item.subtitle}</small>
                    )}
                </button>
            </li>
        ))}
    </ul>
);
