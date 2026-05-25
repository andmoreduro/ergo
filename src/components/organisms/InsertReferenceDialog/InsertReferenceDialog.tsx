import { useMemo, useState } from "react";
import type { DocumentResources } from "../../../bindings/DocumentResources";
import type { ReferenceEntry } from "../../../bindings/ReferenceEntry";
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
}

type TabId = "resources" | "bibliography" | "outline";

export const InsertReferenceDialog = ({
    open,
    resources,
    references,
    outlineEntries,
    onClose,
    onSelect,
}: InsertReferenceDialogProps) => {
    const [tab, setTab] = useState<TabId>("resources");

    const resourceItems = useMemo(
        () =>
            (resources?.groups ?? []).flatMap((group) =>
                group.entries.map((entry) => ({
                    key: entry.id,
                    label: entry.label,
                    subtitle: entry.subtitle ?? group.label,
                    referenceId: entry.id,
                })),
            ),
        [resources],
    );

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

                <div className={styles.tabs} role="tablist">
                    <button
                        type="button"
                        role="tab"
                        className={`${styles.tab} ${tab === "resources" ? styles.tabActive : ""}`}
                        aria-selected={tab === "resources"}
                        onClick={() => setTab("resources")}
                    >
                        {m.insert_reference_tab_resources()}
                    </button>
                    <button
                        type="button"
                        role="tab"
                        className={`${styles.tab} ${tab === "bibliography" ? styles.tabActive : ""}`}
                        aria-selected={tab === "bibliography"}
                        onClick={() => setTab("bibliography")}
                    >
                        {m.insert_reference_tab_bibliography()}
                    </button>
                    <button
                        type="button"
                        role="tab"
                        className={`${styles.tab} ${tab === "outline" ? styles.tabActive : ""}`}
                        aria-selected={tab === "outline"}
                        onClick={() => setTab("outline")}
                    >
                        {m.insert_reference_tab_outline()}
                    </button>
                </div>

                {tab === "resources" && (
                    <ReferenceList
                        emptyMessage={m.sidebar_empty_resources()}
                        items={resourceItems.map((item) => ({
                            key: item.key,
                            label: item.label,
                            subtitle: item.subtitle,
                            onPick: () =>
                                onSelect({
                                    referenceId: item.referenceId,
                                    label: item.label,
                                }),
                        }))}
                    />
                )}

                {tab === "bibliography" && (
                    <ReferenceList
                        emptyMessage={m.sidebar_empty_bibliography()}
                        items={references.map((entry) => ({
                            key: entry.id,
                            label: entry.citation_key,
                            subtitle: m.insert_reference_bibliography_subtitle(),
                            onPick: () =>
                                onSelect({
                                    referenceId: entry.id,
                                    label: entry.citation_key,
                                }),
                        }))}
                    />
                )}

                {tab === "outline" && (
                    <ReferenceList
                        emptyMessage={m.sidebar_empty_outline()}
                        items={outlineEntries.map((entry) => ({
                            key: entry.key,
                            label: entry.text,
                            subtitle: m.sidebar_outline_page({ page: entry.page }),
                            onPick: () =>
                                onSelect({
                                    referenceId: entry.target.elementId,
                                    label: entry.text,
                                }),
                        }))}
                    />
                )}
            </div>
        </div>
    );
};

const ReferenceList = ({
    items,
    emptyMessage,
}: {
    items: Array<{
        key: string;
        label: string;
        subtitle?: string;
        onPick: () => void;
    }>;
    emptyMessage: string;
}) => {
    if (items.length === 0) {
        return <p className={styles.empty}>{emptyMessage}</p>;
    }

    return (
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
};
