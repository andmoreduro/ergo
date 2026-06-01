import {
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { ActionContextProvider } from "../../../actions/runtime";
import { EditorState, type Selection, type Transaction } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import "prosemirror-gapcursor/style/gapcursor.css";
import "prosemirror-tables/style/tables.css";
import "../../../editor/prosemirror/nodeViews/tableBlockNodeView.global.css";
import type { ContentSection } from "../../../bindings/ContentSection";
import { useDocumentAst, useDocumentFocus } from "../../../state/DocumentContext";
import {
    changedTopLevelRange,
    docToElements,
    nodeToElement,
    sectionToDoc,
} from "../../../editor/prosemirror/astBridge";
import {
    diffChangedBlocks,
    diffSectionElements,
    rangeSignificantlyEqual,
    sectionSignificantlyEqual,
    type SectionEventDelta,
} from "../../../editor/prosemirror/sectionDiff";
import {
    focusTargetFromState,
    selectionForFocusTarget,
} from "../../../editor/prosemirror/selection";
import { bodyPlugins } from "../../../editor/prosemirror/plugins";
import { createBlockObjectNodeViews } from "../../../editor/prosemirror/nodeViews/blockObjectNodeViews";
import { NodeViewPortalRegistry } from "../../../editor/prosemirror/nodeViews/nodeViewPortals";
import {
    createTableBlockNodeView,
    TABLE_ATTR_SYNC_META,
} from "../../../editor/prosemirror/nodeViews/tableBlockNodeView";
import { bodySchema } from "../../../editor/prosemirror/schema";
import { insertParagraphBeforeElement } from "../../../editor/insertParagraphBeforeElement";
import {
    clearActiveBodyView,
    setActiveBodyView,
    setBodyHistoryActions,
    setBodyParagraphInsert,
    setBodyTableCommit,
} from "../../../editor/prosemirror/activeView";
import { elementIdOf } from "../../../state/documentEvents/helpers";
import { bodyEditorActionHandlers } from "../../../editor/prosemirror/bodyEditorActions";
import { enterTableBlockById } from "../../../editor/prosemirror/bodyTableCommands";
import { takePendingBlockEditIfMatches } from "../../../editor/prosemirror/pendingBlockEdit";
import { ProseMirrorSurface } from "../../atoms/ProseMirrorSurface/ProseMirrorSurface";

const deepEqual = (a: unknown, b: unknown): boolean =>
    JSON.stringify(a) === JSON.stringify(b);

/**
 * Reconcile an externally-changed section into the live doc with a single
 * transaction instead of rebuilding the whole EditorState, so ProseMirror reuses
 * the existing NodeViews. Crucially, an atom block edited through its own React
 * editor (e.g. the equation source textarea) changes the AST but not the PM doc;
 * a full rebuild would remount that NodeView on every keystroke and steal its DOM
 * focus/caret. Patching in place (setNodeMarkup for an attr-only change) keeps the
 * node — and its focused field — alive. Returns false when the top-level block
 * count changed and the caller must fall back to a full rebuild.
 */
const reconcileDocInPlace = (view: EditorView, target: PMNode): boolean => {
    const current = view.state.doc;
    if (current.childCount !== target.childCount) {
        return false;
    }
    const starts: number[] = [];
    let offset = 0;
    for (let i = 0; i < current.childCount; i += 1) {
        starts.push(offset);
        offset += current.child(i).nodeSize;
    }
    let tr = view.state.tr;
    let changed = false;
    for (let i = 0; i < current.childCount; i += 1) {
        const before = current.child(i);
        const after = target.child(i);
        if (before.eq(after)) {
            continue;
        }
        const from = tr.mapping.map(starts[i]);
        if (before.type === after.type && before.content.eq(after.content)) {
            // Same node, only attrs differ (an atom's `element` payload): keeps
            // the node size and triggers NodeView.update() rather than a remount.
            tr = tr.setNodeMarkup(from, undefined, after.attrs, after.marks);
        } else {
            const to = tr.mapping.map(starts[i] + before.nodeSize);
            tr = tr.replaceWith(from, to, after);
        }
        changed = true;
    }
    if (!changed) {
        return true;
    }
    tr.setMeta("addToHistory", false);
    view.dispatch(tr);
    return true;
};

/**
 * Controlled ProseMirror view over one content section. The AST event history
 * remains the single source of truth: each transaction is translated into
 * fine-grained DocumentEvents (one undo entry), and any AST change that did not
 * originate here is reconciled back into the doc. Preview ↔ editor caret sync
 * flows through the unchanged `documentFocus` tuple.
 */
export const ProseMirrorBodyEditor = ({
    section,
}: {
    section: ContentSection;
}) => {
    const { state: documentAst, dispatch, commitDocumentEvents, undo, redo, canUndo, canRedo } =
        useDocumentAst();
    const { documentFocus, setDocumentFocus } = useDocumentFocus();

    const mountRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const pluginsRef = useRef(bodyPlugins());
    const portalRegistryRef = useRef<NodeViewPortalRegistry>(
        new NodeViewPortalRegistry(),
    );
    const nodeViewsRef = useRef({
        ...createBlockObjectNodeViews(portalRegistryRef.current),
        table_block: createTableBlockNodeView,
    });
    const portals = useSyncExternalStore(
        portalRegistryRef.current.subscribe,
        portalRegistryRef.current.getSnapshot,
    );

    const bodyHandlers = useMemo(() => bodyEditorActionHandlers(), []);

    const sectionRef = useRef(section);
    sectionRef.current = section;
    const commitRef = useRef(commitDocumentEvents);
    commitRef.current = commitDocumentEvents;
    const setFocusRef = useRef(setDocumentFocus);
    setFocusRef.current = setDocumentFocus;

    // Suppresses AST/focus echo while we apply an externally-driven doc/selection.
    const applyingExternalRef = useRef(false);
    const lastFocusRequestRef = useRef<number | null>(null);
    // Set when this view originated the pending commit. The resulting section
    // change is already reflected in the doc, so the reconciliation effect can
    // skip re-deriving and deep-comparing the whole section on that pass.
    const pmOriginCommitRef = useRef(false);

    const canUndoRef = useRef(canUndo);
    const canRedoRef = useRef(canRedo);
    canUndoRef.current = canUndo;
    canRedoRef.current = canRedo;

    const documentAstRef = useRef(documentAst);
    documentAstRef.current = documentAst;
    const dispatchRef = useRef(dispatch);
    dispatchRef.current = dispatch;

    useLayoutEffect(() => {
        setBodyHistoryActions({
            undo,
            redo,
            canUndo: () => canUndoRef.current,
            canRedo: () => canRedoRef.current,
        });
        return () => setBodyHistoryActions(null);
    }, [undo, redo]);

    useLayoutEffect(() => {
        setBodyParagraphInsert({
            insertBeforeElement: (beforeElementId) => {
                insertParagraphBeforeElement(
                    documentAstRef.current,
                    dispatchRef.current,
                    setFocusRef.current,
                    beforeElementId,
                );
            },
        });
        return () => setBodyParagraphInsert(null);
    }, []);

    useLayoutEffect(() => {
        setBodyTableCommit({
            sectionId: section.id,
            commit: (forward, inverse) => {
                pmOriginCommitRef.current = true;
                commitRef.current(forward, inverse);
            },
            elementIndex: (tableId) =>
                sectionRef.current.elements.findIndex(
                    (element) => elementIdOf(element) === tableId,
                ),
        });
        return () => setBodyTableCommit(null);
    }, [section.id]);

    useLayoutEffect(() => {
        const mount = mountRef.current;
        if (!mount) {
            return;
        }

        const handleTransaction = (tr: Transaction) => {
            const view = viewRef.current;
            if (!view) {
                return;
            }
            const nextState = view.state.apply(tr);
            view.updateState(nextState);

            if (applyingExternalRef.current) {
                return;
            }

            if (tr.docChanged) {
                if (tr.getMeta(TABLE_ATTR_SYNC_META)) {
                    return;
                }
                const current = sectionRef.current;
                // Fast path: a single-step, same-block-count edit (ordinary
                // typing) only touched a few top-level blocks, so convert and
                // diff just those instead of re-deriving the whole section.
                const scopedRange =
                    tr.before.childCount === nextState.doc.childCount &&
                    nextState.doc.childCount === current.elements.length
                        ? changedTopLevelRange(tr)
                        : null;

                let delta: SectionEventDelta | null = null;
                if (scopedRange) {
                    const [fromIndex, toIndex] = scopedRange;
                    const nextElements = current.elements.slice();
                    for (let i = fromIndex; i <= toIndex; i += 1) {
                        nextElements[i] = nodeToElement(nextState.doc.child(i));
                    }
                    if (
                        !rangeSignificantlyEqual(
                            current.elements,
                            nextElements,
                            fromIndex,
                            toIndex,
                        )
                    ) {
                        delta =
                            diffChangedBlocks(
                                current.id,
                                current.elements,
                                nextElements,
                                fromIndex,
                                toIndex,
                            ) ??
                            diffSectionElements(
                                current.id,
                                current.elements,
                                nextElements,
                            );
                    }
                } else {
                    const nextElements = docToElements(nextState.doc);
                    if (
                        !sectionSignificantlyEqual(current.elements, nextElements)
                    ) {
                        delta = diffSectionElements(
                            current.id,
                            current.elements,
                            nextElements,
                        );
                    }
                }

                if (delta && delta.forward.length > 0) {
                    pmOriginCommitRef.current = true;
                    commitRef.current(delta.forward, delta.inverse);
                }
            }

            if ((tr.selectionSet || tr.docChanged) && view.hasFocus()) {
                const target = focusTargetFromState(nextState);
                if (target) {
                    setFocusRef.current({
                        elementId: target.elementId,
                        fieldId: target.fieldId,
                        caretUtf16Offset: target.caretUtf16Offset,
                        sourceRevision: null,
                        anchorPageNumber: null,
                        forcePreviewScroll: false,
                        focusSource: "native",
                    });
                }
            }
        };

        const view = new EditorView(mount, {
            state: EditorState.create({
                doc: sectionToDoc(bodySchema, sectionRef.current),
                plugins: pluginsRef.current,
            }),
            attributes: {
                spellcheck: "false",
            },
            nodeViews: nodeViewsRef.current,
            dispatchTransaction: handleTransaction,
            handleDOMEvents: {
                focus: () => {
                    setActiveBodyView(view);
                    return false;
                },
            },
        });
        viewRef.current = view;

        return () => {
            clearActiveBodyView(view);
            view.destroy();
            viewRef.current = null;
        };
    }, []);

    // Reconcile externally-applied AST changes (undo/redo, toolbar insert/delete,
    // reference insert) back into the doc. PM-origin commits already match, so the
    // structural compare short-circuits and prevents an update loop.
    useEffect(() => {
        const view = viewRef.current;
        if (!view) {
            return;
        }
        // This section change is the echo of our own commit; the doc already
        // matches it (diffSectionElements verified the round-trip), so skip the
        // full docToElements re-derive + deep compare on the typing hot path.
        if (pmOriginCommitRef.current) {
            pmOriginCommitRef.current = false;
            return;
        }
        if (deepEqual(docToElements(view.state.doc), section.elements)) {
            return;
        }

        applyingExternalRef.current = true;
        try {
            const doc = sectionToDoc(bodySchema, section);
            // Prefer an in-place patch (keeps Nodeviews/focus); fall back to a
            // full rebuild only when the block structure changed.
            if (reconcileDocInPlace(view, doc)) {
                return;
            }
            const prevTarget = focusTargetFromState(view.state);
            const selection: Selection | null = prevTarget
                ? selectionForFocusTarget(doc, prevTarget)
                : null;
            view.updateState(
                EditorState.create({
                    doc,
                    plugins: pluginsRef.current,
                    selection: selection ?? undefined,
                }),
            );
        } finally {
            applyingExternalRef.current = false;
        }
    }, [section]);

    // Apply externally-requested focus (preview click, sidebar nav, insert) to
    // the PM selection.
    useEffect(() => {
        const view = viewRef.current;
        if (!view || documentFocus.focusSource === "native") {
            return;
        }
        if (
            !documentFocus.elementId ||
            lastFocusRequestRef.current === documentFocus.requestId
        ) {
            return;
        }

        // A freshly-inserted table opens directly in fine-grained mode with the
        // caret in its first cell, so the user can type immediately.
        if (takePendingBlockEditIfMatches(documentFocus.elementId)) {
            lastFocusRequestRef.current = documentFocus.requestId;
            applyingExternalRef.current = true;
            try {
                enterTableBlockById(view, documentFocus.elementId);
            } finally {
                applyingExternalRef.current = false;
            }
            return;
        }

        const selection = selectionForFocusTarget(view.state.doc, {
            elementId: documentFocus.elementId,
            fieldId: documentFocus.fieldId,
            caretUtf16Offset: documentFocus.caretUtf16Offset,
        });
        if (!selection) {
            return;
        }

        lastFocusRequestRef.current = documentFocus.requestId;
        applyingExternalRef.current = true;
        try {
            view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
            view.focus();
        } finally {
            applyingExternalRef.current = false;
        }
    }, [documentFocus]);

    return (
        <ActionContextProvider
            id={`body-${section.id}`}
            contexts={["body", "editor"]}
            handlers={bodyHandlers}
        >
            <ProseMirrorSurface ref={mountRef} />
            {portals.map((entry) =>
                createPortal(entry.render(), entry.dom, entry.key),
            )}
        </ActionContextProvider>
    );
};
