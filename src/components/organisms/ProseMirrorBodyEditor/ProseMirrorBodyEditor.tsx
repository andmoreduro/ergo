import {
    memo,
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
import { markInputReceived } from "../../../perf/inputTimestamp";
import "../../../editor/prosemirror/nodeViews/blockObjectNodeViews.global.css";
import "../../../editor/prosemirror/nodeViews/tableBlockNodeView.global.css";
import type { ContentSection } from "../../../bindings/ContentSection";
import {
    useDocumentActions,
    useDocumentAstStore,
    useDocumentFocusSelector,
    useDocumentReconcile,
} from "../../../state/DocumentContext";
import {
    changedBlockWindow,
    docToElements,
    nodeToElement,
    sectionToDoc,
} from "../../../editor/prosemirror/astBridge";
import {
    diffChangedBlocks,
    diffSectionElements,
    diffSectionWindow,
    rangeSignificantlyEqual,
    sectionSignificantlyEqual,
    type SectionEventDelta,
} from "../../../editor/prosemirror/sectionDiff";
import { rememberBodyFocus } from "../../../editor/editorFocusMemory";
import {
    focusTargetFromState,
    selectionForFocusRange,
    selectionForFocusTarget,
} from "../../../editor/prosemirror/selection";
import {
    takePendingFindNavigation,
} from "../../../editor/find/documentFind";
import { applyProseMirrorDocumentFindMatch } from "../../../editor/find/prosemirrorFindPlugin";
import { bodyPlugins } from "../../../editor/prosemirror/plugins";
import { createBlockObjectNodeViews } from "../../../editor/prosemirror/nodeViews/blockObjectNodeViews";
import { createInlineEquationNodeView } from "../../../editor/prosemirror/nodeViews/inlineEquationNodeView";
import { createInlineQuoteNodeView } from "../../../editor/prosemirror/nodeViews/inlineQuoteNodeView";
import { NodeViewPortalRegistry } from "../../../editor/prosemirror/nodeViews/nodeViewPortals";
import {
    createTableBlockNodeView,
    TABLE_ATTR_SYNC_META,
} from "../../../editor/prosemirror/nodeViews/tableBlockNodeView";
import { ATOM_BLOCK_NODES, TABLE_BLOCK_NODE, bodySchema } from "../../../editor/prosemirror/schema";
import { insertParagraphAfterElement } from "../../../editor/insertParagraphAfterElement";
import { insertParagraphBeforeElement } from "../../../editor/insertParagraphBeforeElement";
import {
    clearActiveBodyView,
    setActiveBodyView,
    setBodyParagraphInsert,
    setBodyAstDispatch,
    setBodyClipboardPasteDeps,
    setBodyTableCommit,
    setBodyReconcileGuard,
} from "../../../editor/prosemirror/activeView";
import { useTemplateSpecContext } from "../../../state/TemplateSpecContext";
import { contentSectionFromAst } from "../../../editor/prosemirror/sectionReconcileGuard";
import { elementIdOf } from "../../../state/documentEvents/helpers";
import {
    useDefaultEquationSyntax,
    useGlobalSettings,
} from "../../../settings/SettingsProvider";
import { bodyEditorActionHandlers } from "../../../editor/prosemirror/bodyEditorActions";
import { enterBlockEditById } from "../../../editor/prosemirror/bodyTableCommands";
import { getActiveInlineEquationFocus } from "../../../editor/prosemirror/inlineEquationFocus";
import { takePendingBlockEditIfMatches } from "../../../editor/prosemirror/pendingBlockEdit";
import { setTableFocusPush } from "../../../editor/prosemirror/table/tableFocusBridge";
import { applyTableCellFocus } from "../../../editor/prosemirror/table/tableFocusRegistry";
import { locateTableCell } from "../../../editor/prosemirror/table/tableCellResolve";
import { ProseMirrorSurface } from "../../atoms/ProseMirrorSurface/ProseMirrorSurface";
import bodyPaperStyles from "../../atoms/ProseMirrorSurface/ProseMirrorSurface.module.css";
import { deepEqual } from "../../../editor/deepEqual";

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
/** Ids of the atom block elements (equation, figure, diagram, custom) in `doc`. */
const atomBlockElementIds = (doc: PMNode): Set<string> => {
    const ids = new Set<string>();
    doc.forEach((node) => {
        if (ATOM_BLOCK_NODES.has(node.type.name) && node.type.name !== TABLE_BLOCK_NODE) {
            const id =
                (node.attrs.element as { id?: string } | null)?.id ??
                (node.attrs.elementId as string);
            if (id) {
                ids.add(id);
            }
        }
    });
    return ids;
};

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

const ProseMirrorBodyEditorImpl = ({
    sectionId,
    autoFocus = false,
}: {
    sectionId: string;
    autoFocus?: boolean;
}) => {
    const { dispatch, commitDocumentEvents, setDocumentFocus } =
        useDocumentActions();
    const { externalRevision } = useDocumentReconcile();
    const astStore = useDocumentAstStore();
    const { spec: templateSpec } = useTemplateSpecContext();
    const templateSpecRef = useRef(templateSpec);
    templateSpecRef.current = templateSpec;
    const defaultEquationSyntax = useDefaultEquationSyntax();
    const virtualizeOffscreenBlocks =
        useGlobalSettings().editor_virtualize_offscreen_blocks ?? true;
    // React only to EXTERNAL focus requests (preview click, sidebar nav). The
    // native focus this editor pushes on every keystroke is filtered out here so
    // it never re-renders the editor.
    const externalFocus = useDocumentFocusSelector(
        (focus) => focus,
        (_prev, next) => next.focusSource === "native",
    );

    // The live content section, read on demand from the AST store so the editor
    // doesn't need to re-render (and receive a new `section` prop) on every
    // keystroke just to keep its reconcile source fresh.
    const liveSection = (): ContentSection =>
        contentSectionFromAst(astStore.getSnapshot(), sectionId) ?? {
            id: sectionId,
            is_optional: false,
            elements: [],
        };

    const mountRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const pluginsRef = useRef<ReturnType<typeof bodyPlugins> | null>(null);
    const portalRegistryRef = useRef<NodeViewPortalRegistry>(
        new NodeViewPortalRegistry(),
    );
    const nodeViewsRef = useRef({
        ...createBlockObjectNodeViews(portalRegistryRef.current),
        inlineEquation: createInlineEquationNodeView(portalRegistryRef.current),
        inlineQuote: createInlineQuoteNodeView(portalRegistryRef.current),
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

    const bodyInsertDeps = useMemo(
        () => ({
            getAst: () => astStore.getSnapshot(),
            dispatch: (action: Parameters<typeof dispatchRef.current>[0]) =>
                dispatchRef.current(action),
            setDocumentFocus: (focus: Parameters<typeof setFocusRef.current>[0]) =>
                setFocusRef.current(focus),
            defaultEquationSyntax,
            quotePolicy: templateSpecRef.current?.editor.quote_policy ?? null,
        }),
        // Everything else is read live through refs, so the handler map only
        // re-memoizes when the user changes the default equation syntax.
        [defaultEquationSyntax],
    );

    const bodyHandlers = useMemo(
        () => bodyEditorActionHandlers(bodyInsertDeps),
        [bodyInsertDeps],
    );

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

    const dispatchRef = useRef(dispatch);
    dispatchRef.current = dispatch;

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
                    astStore.getSnapshot(),
                    dispatchRef.current,
                    setFocusRef.current,
                    beforeElementId,
                );
            },
            insertAfterElement: (afterElementId) => {
                insertParagraphAfterElement(
                    astStore.getSnapshot(),
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
        setBodyClipboardPasteDeps({
            getAst: () => astStore.getSnapshot(),
            getTemplateSpec: () => templateSpecRef.current,
            dispatch: (action) => dispatchRef.current(action),
            setDocumentFocus: (focus) => setFocusRef.current(focus),
        });
        return () => setBodyClipboardPasteDeps(null);
    }, [astStore]);

    useLayoutEffect(() => {
        setBodyTableCommit({
            sectionId,
            commit: (forward, inverse) => {
                markPmCommit();
                commitRef.current(forward, inverse);
            },
            elementIndex: (tableId) =>
                liveSection().elements.findIndex(
                    (element) => elementIdOf(element) === tableId,
                ),
        });
        return () => setBodyTableCommit(null);
    }, [sectionId]);

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
            // Stamp the earliest moment a transaction arrives, before any input
            // pipeline work runs. Paired with `lastEvent.timestamp` (queued-event
            // time) by the telemetry finalizer to compute `inputToCommitMs` —
            // the prefix the overlay's `latency` clock otherwise misses.
            markInputReceived();
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
                const current = liveSection();
                const before = tr.before;
                const after = nextState.doc;

                let delta: SectionEventDelta | null = null;
                if (before.childCount === current.elements.length) {
                    // Fast path: ProseMirror keeps the identity of top-level
                    // nodes a transaction did not touch, so the edited window
                    // is the span between the two docs' common prefix and
                    // suffix. Only that window is converted and diffed, so
                    // typing, Enter/Backspace, IME composition and paste cost
                    // O(edit) instead of re-deriving the whole section.
                    const { start, prevEnd, nextEnd } = changedBlockWindow(
                        before,
                        after,
                    );
                    if (start < prevEnd || start < nextEnd) {
                        const nextElements = current.elements.slice(0, start);
                        for (let i = start; i < nextEnd; i += 1) {
                            nextElements.push(nodeToElement(after.child(i)));
                        }
                        for (let i = prevEnd; i < current.elements.length; i += 1) {
                            nextElements.push(current.elements[i]);
                        }
                        if (prevEnd - start === nextEnd - start) {
                            const toIndex = nextEnd - 1;
                            if (
                                !rangeSignificantlyEqual(
                                    current.elements,
                                    nextElements,
                                    start,
                                    toIndex,
                                )
                            ) {
                                delta =
                                    diffChangedBlocks(
                                        current.id,
                                        current.elements,
                                        nextElements,
                                        start,
                                        toIndex,
                                    ) ??
                                    diffSectionElements(
                                        current.id,
                                        current.elements,
                                        nextElements,
                                    );
                            }
                        } else {
                            // A block-count change is always significant.
                            delta = diffSectionWindow(
                                current.id,
                                current.elements,
                                nextElements,
                                start,
                                prevEnd,
                                nextEnd,
                            );
                        }
                    }
                } else {
                    const nextElements = docToElements(after);
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
                const inlineTarget = getActiveInlineEquationFocus()?.getFieldTarget();
                const target =
                    inlineTarget ?? focusTargetFromState(nextState);
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
                doc: sectionToDoc(bodySchema, liveSection()),
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
    // reference insert) back into the doc. This fires ONLY on `externalRevision`
    // — never on body typing (`COMMIT_EVENTS` doesn't bump it) — so the costly
    // whole-document re-derive + compare is off the typing hot path. PM-origin
    // commits update the AST synchronously without bumping `externalRevision`, so
    // when this runs the doc is never behind and an external change is always
    // authoritative; reconcile it in.
    useLayoutEffect(() => {
        const view = viewRef.current;
        if (!view) {
            return;
        }
        skipPmReconcileRef.current = false;
        const astSection = liveSection();
        if (deepEqual(docToElements(view.state.doc), astSection.elements)) {
            return;
        }

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
    }, [sectionId, externalRevision]);

    // Apply externally-requested focus (preview click, sidebar nav, insert) to
    // the PM selection.
    useEffect(() => {
        const view = viewRef.current;
        if (!view || externalFocus.focusSource === "native") {
            return;
        }
        if (
            !externalFocus.elementId ||
            lastFocusRequestRef.current === externalFocus.requestId
        ) {
            return;
        }

        // A freshly-inserted block (table, equation, …) opens directly in
        // fine-grained mode with its primary field focused, so the user types
        // into it immediately instead of replacing the node-selected block.
        if (takePendingBlockEditIfMatches(externalFocus.elementId)) {
            lastFocusRequestRef.current = externalFocus.requestId;
            applyingExternalRef.current = true;
            try {
                enterBlockEditById(view, externalFocus.elementId);
            } finally {
                applyingExternalRef.current = false;
            }
            return;
        }

        const target = {
            elementId: externalFocus.elementId,
            fieldId: externalFocus.fieldId,
            caretUtf16Offset: externalFocus.caretUtf16Offset,
        };

        lastFocusRequestRef.current = externalFocus.requestId;
        applyingExternalRef.current = true;
        try {
            const tableCell = locateTableCell(
                astStore.getSnapshot(),
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

            // A field of an atom block (equation source, diagram caption, …)
            // lives in the block's own React editor: open the block in edit
            // mode and let that field's binding take focus. Node-selecting the
            // block and focusing ProseMirror here would end edit mode at once
            // (blockFocusInvariant) and leave the field unfocused.
            if (
                target.fieldId !== null &&
                atomBlockElementIds(view.state.doc).has(target.elementId)
            ) {
                enterBlockEditById(view, target.elementId);
                return;
            }

            const pendingFind = takePendingFindNavigation();
            const selection =
                typeof externalFocus.selectionEndUtf16Offset === "number"
                    ? selectionForFocusRange(
                          view.state.doc,
                          target,
                          externalFocus.selectionEndUtf16Offset,
                      )
                    : selectionForFocusTarget(view.state.doc, target);
            if (!selection) {
                return;
            }

            if (
                pendingFind &&
                pendingFind.match.elementId === target.elementId &&
                pendingFind.match.fieldId === target.fieldId &&
                selection instanceof TextSelection
            ) {
                applyProseMirrorDocumentFindMatch(
                    view.state,
                    view.dispatch.bind(view),
                    pendingFind.query,
                    selection.from,
                    selection.to,
                );
                view.focus();
                return;
            }

            view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
            view.focus();
        } finally {
            applyingExternalRef.current = false;
        }
    }, [externalFocus]);

    return (
        <ActionContextProvider
            id={`body-${sectionId}`}
            contexts={["body", "editor"]}
            handlers={bodyHandlers}
        >
            <ProseMirrorSurface ref={mountRef} virtualized={virtualizeOffscreenBlocks} />
            {portals.map((entry) =>
                createPortal(entry.render(), entry.dom, entry.key),
            )}
        </ActionContextProvider>
    );
};

/**
 * Memoized on `sectionId` (stable) so body typing — which changes the AST but
 * not this prop — never re-renders the editor subtree. External AST changes are
 * reconciled through `useDocumentReconcile`, not through prop churn.
 */
export const ProseMirrorBodyEditor = memo(ProseMirrorBodyEditorImpl);
