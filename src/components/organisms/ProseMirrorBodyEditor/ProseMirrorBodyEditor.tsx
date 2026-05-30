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
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import "prosemirror-gapcursor/style/gapcursor.css";
import "prosemirror-tables/style/tables.css";
import "../../../editor/prosemirror/nodeViews/tableBlockNodeView.global.css";
import type { ContentSection } from "../../../bindings/ContentSection";
import { useDocumentAst, useDocumentFocus } from "../../../state/DocumentContext";
import { docToElements, sectionToDoc } from "../../../editor/prosemirror/astBridge";
import {
    diffSectionElements,
    sectionSignificantlyEqual,
} from "../../../editor/prosemirror/sectionDiff";
import {
    focusTargetFromState,
    selectionForFocusTarget,
} from "../../../editor/prosemirror/selection";
import { bodyPlugins } from "../../../editor/prosemirror/plugins";
import { createBlockObjectNodeViews } from "../../../editor/prosemirror/nodeViews/blockObjectNodeViews";
import { NodeViewPortalRegistry } from "../../../editor/prosemirror/nodeViews/nodeViewPortals";
import { createTableBlockNodeView } from "../../../editor/prosemirror/nodeViews/tableBlockNodeView";
import { bodySchema } from "../../../editor/prosemirror/schema";
import { insertParagraphBeforeElement } from "../../../editor/insertParagraphBeforeElement";
import {
    clearActiveBodyView,
    setActiveBodyView,
    setBodyHistoryActions,
    setBodyParagraphInsert,
} from "../../../editor/prosemirror/activeView";
import { bodyEditorActionHandlers } from "../../../editor/prosemirror/bodyEditorActions";
import { ProseMirrorSurface } from "../../atoms/ProseMirrorSurface/ProseMirrorSurface";

const deepEqual = (a: unknown, b: unknown): boolean =>
    JSON.stringify(a) === JSON.stringify(b);

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
                const current = sectionRef.current;
                const nextElements = docToElements(nextState.doc);
                if (!sectionSignificantlyEqual(current.elements, nextElements)) {
                    const delta = diffSectionElements(
                        current.id,
                        current.elements,
                        nextElements,
                    );
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
        if (deepEqual(docToElements(view.state.doc), section.elements)) {
            return;
        }

        applyingExternalRef.current = true;
        try {
            const doc = sectionToDoc(bodySchema, section);
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
