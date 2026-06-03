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
import { contentSectionFromAst } from "../../../editor/prosemirror/sectionReconcileGuard";
import { elementIdOf } from "../../../state/documentEvents/helpers";
import { bodyEditorActionHandlers } from "../../../editor/prosemirror/bodyEditorActions";
import { enterBlockEditById } from "../../../editor/prosemirror/bodyTableCommands";
import { takePendingBlockEditIfMatches } from "../../../editor/prosemirror/pendingBlockEdit";
import { setTableFocusPush } from "../../../editor/prosemirror/table/tableFocusBridge";
import { applyTableCellFocus } from "../../../editor/prosemirror/table/tableFocusRegistry";
import { locateTableCell } from "../../../editor/prosemirror/table/tableCellResolve";
import { ProseMirrorSurface } from "../../atoms/ProseMirrorSurface/ProseMirrorSurface";
import bodyPaperStyles from "../../atoms/ProseMirrorSurface/ProseMirrorSurface.module.css";

/**
 * Structural deep-equality that short-circuits at the first difference and
 * allocates nothing. Used on the typing hot path to compare the editor doc
 * against the AST section every keystroke, so `JSON.stringify`-ing the whole
 * document twice per keystroke (the previous approach) is far too costly on
 * larger documents. `undefined` values are treated as absent to match the
 * JSON-serialization semantics this replaces.
 */
const deepEqual = (a: unknown, b: unknown): boolean => {
    if (a === b) {
        return true;
    }
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
        return false;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i += 1) {
            if (!deepEqual(a[i], b[i])) {
                return false;
            }
        }
        return true;
    }
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj).filter((key) => aObj[key] !== undefined);
    const bKeys = Object.keys(bObj).filter((key) => bObj[key] !== undefined);
    if (aKeys.length !== bKeys.length) {
        return false;
    }
    for (const key of aKeys) {
        if (!deepEqual(aObj[key], bObj[key])) {
            return false;
        }
    }
    return true;
};

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

const ProseMirrorBodyEditorImpl = ({
    sectionId,
    autoFocus = false,
}: {
    sectionId: string;
    autoFocus?: boolean;
}) => {
    const { dispatch, commitDocumentEvents, undo, redo, setDocumentFocus } =
        useDocumentActions();
    const { externalRevision, canUndo, canRedo } = useDocumentReconcile();
    const astStore = useDocumentAstStore();
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

            const selection = selectionForFocusTarget(view.state.doc, target);
            if (!selection) {
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
            <ProseMirrorSurface ref={mountRef} />
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
