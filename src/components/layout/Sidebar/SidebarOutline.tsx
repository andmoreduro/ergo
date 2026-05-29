import { memo, useMemo, type CSSProperties, type RefObject } from "react";
import type { DocumentOutline } from "../../../bindings/DocumentOutline";
import { useDocument } from "../../../state/DocumentContext";
import { useActionDispatcher } from "../../../actions/runtime";
import {
    buildTargetedOutlineEntries,
    collectHeadingTargets,
    type TargetedOutlineEntry,
} from "../../../editor/outlineMatching";
import {
    projectInputElementId,
    projectInputFieldId,
} from "../../../editor/fieldIds";
import { scrollPreviewToPage } from "../../../preview/previewScroll";
import { m } from "../../../paraglide/messages.js";
import { NavItemButton } from "../../atoms/NavItemButton/NavItemButton";
import styles from "./Sidebar.module.css";

const outlineIndentStyle = (level: number): CSSProperties => ({
    paddingLeft: `${Math.max(0, level - 1) * 12}px`,
});

const normalizeOutlineText = (value: string): string =>
    value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

const isAbstractEntry = (text: string): boolean => {
    const normalized = normalizeOutlineText(text);
    return (
        normalized === "abstract" ||
        normalized === normalizeOutlineText(m.editor_abstract())
    );
};

export type { TargetedOutlineEntry } from "../../../editor/outlineMatching";

export function useSidebarOutline(
    outline: DocumentOutline | null,
    previewRevision: number | null,
    previewScrollRef: RefObject<HTMLElement | null>,
) {
    const { state } = useDocument();
    const dispatchAction = useActionDispatcher();

    const headingTargets = useMemo(
        () => collectHeadingTargets(state.sections),
        [state.sections],
    );

    const outlineEntries = useMemo(
        () =>
            buildTargetedOutlineEntries({
                outline,
                headingTargets,
                isAbstractEntry,
                abstractTarget: {
                    elementId: projectInputElementId,
                    fieldId: projectInputFieldId("/abstract_text"),
                },
            }),
        [headingTargets, outline],
    );

    const handleOutlineClick = (entry: TargetedOutlineEntry) => {
        const scrollRoot = previewScrollRef.current;
        if (scrollRoot) {
            scrollPreviewToPage(scrollRoot, entry.page);
        }

        if (!entry.target) {
            return;
        }

        void dispatchAction({
            id: "editor::FocusField",
            payload: {
                elementId: entry.target.elementId,
                fieldId: entry.target.fieldId,
                caretUtf16Offset: 0,
                anchorPageNumber: entry.page,
                forcePreviewScroll: true,
                sourceRevision: previewRevision,
            },
        });
    };

    return { outlineEntries, handleOutlineClick };
}

export const SidebarOutlinePanel = memo(({
    outline,
    previewRevision,
    previewScrollRef,
}: {
    outline: DocumentOutline | null;
    previewRevision: number | null;
    previewScrollRef: RefObject<HTMLElement | null>;
}) => {
    const { outlineEntries, handleOutlineClick } = useSidebarOutline(
        outline,
        previewRevision,
        previewScrollRef,
    );

    return (
        <CompiledOutline
            entries={outlineEntries}
            onEntryClick={handleOutlineClick}
        />
    );
});

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
                    <NavItemButton
                        variant="outline"
                        style={outlineIndentStyle(entry.level)}
                        onClick={() => onEntryClick(entry)}
                    >
                        <span>{entry.text}</span>
                        <small>{m.sidebar_outline_page({ page: entry.page })}</small>
                    </NavItemButton>
                </li>
            ))}
        </ol>
    );
});
