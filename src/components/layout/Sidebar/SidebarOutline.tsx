import { memo, useMemo, type CSSProperties } from "react";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import type { DocumentOutline } from "../../../bindings/DocumentOutline";
import { useDocument } from "../../../state/DocumentContext";
import { useActionDispatcher } from "../../../actions/runtime";
import {
    defaultFieldIdForElement,
    projectInputElementId,
    projectInputFieldId,
} from "../../../editor/fieldIds";
import { m } from "../../../paraglide/messages.js";
import styles from "./Sidebar.module.css";

const outlineIndentStyle = (level: number): CSSProperties => ({
    paddingLeft: `${Math.max(0, level - 1) * 12}px`,
});

const normalizeOutlineText = (value: string): string =>
    value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

const headingText = (element: DocumentElement): string =>
    element.type === "Heading"
        ? element.content.map((span) => span.text).join("").trim()
        : "";

const isAbstractEntry = (text: string): boolean => {
    const normalized = normalizeOutlineText(text);
    return (
        normalized === "abstract" ||
        normalized === normalizeOutlineText(m.editor_abstract())
    );
};

export type OutlineTarget = {
    elementId: string;
    fieldId: string;
};

export type TargetedOutlineEntry = {
    key: string;
    level: number;
    text: string;
    page: number;
    target: OutlineTarget;
};

const CompiledOutline = memo(({
    entries,
    onEntryClick,
}: {
    entries: TargetedOutlineEntry[];
    onEntryClick: (entry: TargetedOutlineEntry) => void;
}) => {
    if (entries.length === 0) {
        return <p className={styles.empty}>{m.sidebar_empty_outline()}</p>;
    }

    return (
        <ol className={styles.outlineList}>
            {entries.map((entry) => (
                <li key={entry.key}>
                    <button
                        className={styles.outlineItem}
                        style={outlineIndentStyle(entry.level)}
                        type="button"
                        onClick={() => onEntryClick(entry)}
                    >
                        <span>{entry.text}</span>
                        <small>{m.sidebar_outline_page({ page: entry.page })}</small>
                    </button>
                </li>
            ))}
        </ol>
    );
});

export function useSidebarOutline(
    outline: DocumentOutline | null,
    previewRevision: number | null,
) {
    const { state } = useDocument();
    const dispatchAction = useActionDispatcher();

    const headingTargets = useMemo(() => {
        const targets: Array<{
            element: DocumentElement;
            level: number;
            text: string;
        }> = [];

        for (const section of state.sections) {
            if (section.type !== "Content") {
                continue;
            }

            for (const element of section.elements) {
                if (element.type !== "Heading") {
                    continue;
                }

                targets.push({
                    element,
                    level: element.level,
                    text: normalizeOutlineText(headingText(element)),
                });
            }
        }

        return targets;
    }, [state.sections]);

    const outlineEntries = useMemo<TargetedOutlineEntry[]>(() => {
        const usedHeadingIds = new Set<string>();
        let usedAbstract = false;

        return (outline?.entries ?? []).flatMap((entry, index) => {
            if (isAbstractEntry(entry.text) && !usedAbstract) {
                usedAbstract = true;
                return [
                    {
                        key: `abstract-${index}`,
                        level: entry.level,
                        text: entry.text,
                        page: entry.page,
                        target: {
                            elementId: projectInputElementId,
                            fieldId: projectInputFieldId("/abstract_text"),
                        },
                    },
                ];
            }

            const normalizedText = normalizeOutlineText(entry.text);
            const match = headingTargets.find(
                ({ element, level, text }) =>
                    !usedHeadingIds.has(element.id) &&
                    level === entry.level &&
                    text === normalizedText,
            );

            if (!match) {
                return [];
            }

            usedHeadingIds.add(match.element.id);
            return [
                {
                    key: `${match.element.id}-${entry.page}-${index}`,
                    level: entry.level,
                    text: entry.text,
                    page: entry.page,
                    target: {
                        elementId: match.element.id,
                        fieldId: defaultFieldIdForElement(match.element),
                    },
                },
            ];
        });
    }, [headingTargets, outline]);

    const handleOutlineClick = (entry: TargetedOutlineEntry) => {
        void dispatchAction({
            id: "editor::FocusField",
            payload: {
                elementId: entry.target.elementId,
                fieldId: entry.target.fieldId,
                caretUtf16Offset: null,
                sourceRevision: previewRevision,
            },
        });
    };

    return { outlineEntries, handleOutlineClick };
}

export const SidebarOutlinePanel = memo(({
    outline,
    previewRevision,
}: {
    outline: DocumentOutline | null;
    previewRevision: number | null;
}) => {
    const { outlineEntries, handleOutlineClick } = useSidebarOutline(
        outline,
        previewRevision,
    );

    return (
        <CompiledOutline
            entries={outlineEntries}
            onEntryClick={handleOutlineClick}
        />
    );
});
