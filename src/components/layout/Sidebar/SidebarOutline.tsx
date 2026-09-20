import {
    memo,
    useCallback,
    useMemo,
    useRef,
    type CSSProperties,
    type RefObject,
} from "react";
import type { DocumentAST } from "../../../bindings/DocumentAST";
import type { DocumentOutline } from "../../../bindings/DocumentOutline";
import { useDocumentAstSelector } from "../../../state/DocumentContext";
import { useActionDispatcher } from "../../../actions/runtime";
import {
    buildTargetedOutlineEntries,
    collectHeadingTargets,
    headingTargetsEqual,
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

const selectHeadingTargets = (ast: DocumentAST) =>
    collectHeadingTargets(ast.sections);

/**
 * Compiled outline entries matched back to their AST heading elements.
 *
 * Subscribes only to the heading set (identity-compared), so body typing that
 * doesn't touch a heading neither recomputes the mapping nor changes the
 * returned array's identity — which keeps memoized consumers (Editor, the
 * sidebar outline list) from re-rendering per keystroke. Compute it once in
 * the workspace and pass the result down.
 */
export function useOutlineEntries(
    outline: DocumentOutline | null,
): TargetedOutlineEntry[] {
    const headingTargets = useDocumentAstSelector(
        selectHeadingTargets,
        headingTargetsEqual,
    );

    return useMemo(
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
}

export const SidebarOutlinePanel = memo(({
    outlineEntries,
    previewRevision,
    previewScrollRef,
}: {
    outlineEntries: TargetedOutlineEntry[];
    previewRevision: number | null;
    previewScrollRef: RefObject<HTMLElement | null>;
}) => {
    const dispatchAction = useActionDispatcher();
    // Read through refs so the click handler stays identity-stable across
    // compiles; otherwise every compile would re-render the whole outline list.
    const previewRevisionRef = useRef(previewRevision);
    previewRevisionRef.current = previewRevision;

    const handleOutlineClick = useCallback(
        (entry: TargetedOutlineEntry) => {
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
                    sourceRevision: previewRevisionRef.current,
                },
            });
        },
        [dispatchAction, previewScrollRef],
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
