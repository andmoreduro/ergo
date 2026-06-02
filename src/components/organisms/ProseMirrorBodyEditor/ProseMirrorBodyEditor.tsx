import {
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { ActionContextProvider } from "../../../actions/runtime";
import { EditorState, TextSelection, type Selection, type Transaction } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import "prosemirror-gapcursor/style/gapcursor.css";
import "prosemirror-tables/style/tables.css";
import "../../../editor/prosemirror/nodeViews/blockObjectNodeViews.global.css";
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
import { rememberBodyFocus } from "../../../editor/editorFocusMemory";
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
import { insertParagraphAfterElement } from "../../../editor/insertParagraphAfterElement";
import { insertParagraphBeforeElement } from "../../../editor/insertParagraphBeforeElement";
import {
    clearActiveBodyView,
    setActiveBodyView,
    setBodyHistoryActions,
    setBodyParagraphInsert,
    setBodyAstDispatch,
    setBodyTableCommit,
    setBodyReconcileGuard,
} from "../../../editor/prosemirror/activeView";
import {
    contentSectionFromAst,
    pmFormattingAheadOfSection,
} from "../../../editor/prosemirror/sectionReconcileGuard";
import { elementIdOf } from "../../../state/documentEvents/helpers";
import { bodyEditorActionHandlers } from "../../../editor/prosemirror/bodyEditorActions";
import { enterTableBlockById } from "../../../editor/prosemirror/bodyTableCommands";
import { takePendingBlockEditIfMatches } from "../../../editor/prosemirror/pendingBlockEdit";
import { setTableFocusPush } from "../../../editor/prosemirror/table/tableFocusBridge";
import { applyTableCellFocus } from "../../../editor/prosemirror/table/tableFocusRegistry";
import { locateTableCell } from "../../../editor/prosemirror/table/tableCellResolve";
import { ProseMirrorSurface } from "../../atoms/ProseMirrorSurface/ProseMirrorSurface";
import bodyPaperStyles from "../../atoms/ProseMirrorSurface/ProseMirrorSurface.module.css";

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
const initialBodyTextSelection = (doc: PMNode): Selection | undefined => {
    let selection: Selection | undefined;
    doc.forEach((node, offset) => {
        if (selection) {
            return;
        }
        if (node.isTextblock) {
            selection = TextSelection.create(doc, offset + 1);
        }
    });
    return selection;
};

export const ProseMirrorBodyEditor = ({
    section,
    autoFocus = false,
}: {
    section: ContentSection;
    autoFocus?: boolean;
}) => {
    const { state: documentAst, dispatch, commitDocumentEvents, undo, redo, canUndo, canRedo } =
        useDocumentAst();
    const { documentFocus, setDocumentFocus } = useDocumentFocus();

    const mountRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const pluginsRef = useRef<ReturnType<typeof bodyPlugins> | null>(null);
    const portalRegistryRef = useRef<NodeViewPortalRegistry>(
        new NodeViewPortalRegistry(),
    );
    const nodeViewsRef = useRef({
        ...createBlockObjectNodeViews(portalRegistryRef.current),
        table_block: (
            node: PMNode,
            view: EditorView,
            getPos: () => number | undefined,
        ) =>
            createTableBlockNodeView(
                node,
                view,
                getPos,
                portalRegistryRef.current,
            ),
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
    // After a PM-originated AST commit, skip one-way section→doc reconcile until
    // props catch up — rebuilding from a stale `section` would strip marks.
    const skipPmReconcileRef = useRef(false);
    const markPmCommit = () => {
        skipPmReconcileRef.current = true;
    };

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
        setBodyReconcileGuard(() => {
            skipPmReconcileRef.current = false;
        });
        return () => setBodyReconcileGuard(null);
    }, []);

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
            insertAfterElement: (afterElementId) => {
                insertParagraphAfterElement(
                    documentAstRef.current,
                    dispatchRef.current,
                    setFocusRef.current,
                    afterElementId,
                );
            },
        });
        return () => setBodyParagraphInsert(null);
    }, []);

    useLayoutEffect(() => {
        setBodyAstDispatch((action) => dispatchRef.current(action));
        return () => setBodyAstDispatch(null);
    }, []);

    useLayoutEffect(() => {
        setBodyTableCommit({
            sectionId: section.id,
            commit: (forward, inverse) => {
                markPmCommit();
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
        setTableFocusPush((focus) => {
            if (applyingExternalRef.current) {
                return;
            }
            setFocusRef.current({
                ...focus,
                sourceRevision: null,
                anchorPageNumber: null,
                forcePreviewScroll: false,
                focusSource: "native",
            });
        });
        return () => setTableFocusPush(null);
    }, []);

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
                    markPmCommit();
                    commitRef.current(delta.forward, delta.inverse);
                }
            }

            if ((tr.selectionSet || tr.docChanged) && view.hasFocus()) {
                const target = focusTargetFromState(nextState);
                if (
                    target &&
                    target.fieldId != null &&
                    target.caretUtf16Offset != null
                ) {
                    rememberBodyFocus({
                        elementId: target.elementId,
                        fieldId: target.fieldId,
                        caretUtf16Offset: target.caretUtf16Offset,
                    });
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

        const plugins = bodyPlugins();
        pluginsRef.current = plugins;
        const view = new EditorView(mount, {
            state: EditorState.create({
                doc: sectionToDoc(bodySchema, sectionRef.current),
                plugins,
            }),
            attributes: {
                class: bodyPaperStyles.bodyPaper,
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
        setActiveBodyView(view);

        if (autoFocus) {
            requestAnimationFrame(() => {
                view.focus();
                const initial = initialBodyTextSelection(view.state.doc);
                if (initial) {
                    view.dispatch(view.state.tr.setSelection(initial));
                }
            });
        }

        return () => {
            clearActiveBodyView(view);
            view.destroy();
            viewRef.current = null;
        };
    }, []);

    // Reconcile externally-applied AST changes (undo/redo, toolbar insert/delete,
    // reference insert) back into the doc. Compare against the live AST, not a
    // stale `section` prop, and defer while a PM-originated commit is in flight.
    useLayoutEffect(() => {
        const view = viewRef.current;
        if (!view) {
            return;
        }
        const pmElements = docToElements(view.state.doc);
        const astSection =
            contentSectionFromAst(documentAstRef.current, section.id) ?? section;
        const astElements = astSection.elements;

        if (deepEqual(pmElements, astElements)) {
            skipPmReconcileRef.current = false;
            return;
        }

        if (
            skipPmReconcileRef.current &&
            pmFormattingAheadOfSection(pmElements, astElements)
        ) {
            return;
        }

        skipPmReconcileRef.current = false;

        applyingExternalRef.current = true;
        try {
            const doc = sectionToDoc(bodySchema, astSection);
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
                    plugins: pluginsRef.current ?? bodyPlugins(),
                    selection: selection ?? undefined,
                }),
            );
        } finally {
            applyingExternalRef.current = false;
        }
    }, [section, documentAst]);

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

        const target = {
            elementId: documentFocus.elementId,
            fieldId: documentFocus.fieldId,
            caretUtf16Offset: documentFocus.caretUtf16Offset,
        };

        lastFocusRequestRef.current = documentFocus.requestId;
        applyingExternalRef.current = true;
        try {
            const tableCell = locateTableCell(
                documentAstRef.current,
                target.elementId,
                target.fieldId,
            );
            if (
                tableCell &&
                applyTableCellFocus({
                    elementId: tableCell.table.id,
                    fieldId: target.fieldId,
                    caretUtf16Offset: target.caretUtf16Offset,
                })
            ) {
                return;
            }

            const selection = selectionForFocusTarget(view.state.doc, target);
            if (!selection) {
                return;
            }
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
