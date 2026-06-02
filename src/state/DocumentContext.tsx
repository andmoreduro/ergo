import {
    createContext,
    useContext,
    useEffect,
    useReducer,
    ReactNode,
    Dispatch,
    useCallback,
    useMemo,
    useRef,
    useSyncExternalStore,
} from "react";
import { astReducer } from "./ast/reducer";
import { shouldCommitAstAction } from "./ast/commitPolicy";
import type { ASTAction } from "./ast/actions";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { ProjectFile } from "../bindings/ProjectFile";
import type { DocumentEvent as BackendDocumentEvent } from "../bindings/DocumentEvent";
import { createDefaultDocumentAST } from "./ast/defaults";
import {
    applyDocumentEvents,
    createDocumentEventHistoryEntry,
    type DocumentEventHistoryEntry,
} from "./documentEvents";
import { clearBodyReconcileSkip } from "../editor/prosemirror/activeView";

const initialAST: DocumentAST = createDefaultDocumentAST();

export type QueuedDocumentEvent = {
    id: number;
    event: BackendDocumentEvent;
    timestamp: number;
};

export type DocumentFocusSource = "native" | "preview" | "programmatic";

export interface DocumentFocusState {
    elementId: string | null;
    fieldId: string | null;
    caretUtf16Offset: number | null;
    sourceRevision: number | null;
    anchorPageNumber: number | null;
    forcePreviewScroll: boolean;
    focusSource: DocumentFocusSource;
    requestId: number;
}

export type DocumentFocusInput = Omit<DocumentFocusState, "requestId">;

interface DocumentSessionState {
    ast: DocumentAST;
    past: DocumentEventHistoryEntry[];
    future: DocumentEventHistoryEntry[];
    events: QueuedDocumentEvent[];
    nextEventId: number;
    sessionId: number;
    bootstrapFiles: ProjectFile[] | null;
    isDirty: boolean;
    documentFocus: DocumentFocusState;
}

type DocumentSessionAction =
    | { type: "APPLY_AST_ACTION"; action: ASTAction }
    | {
          type: "COMMIT_EVENTS";
          forward: BackendDocumentEvent[];
          inverse: BackendDocumentEvent[];
      }
    | { type: "UNDO" }
    | { type: "REDO" }
    | { type: "MARK_SAVED" }
    | { type: "ACK_DOCUMENT_EVENTS"; upToEventId: number }
    | { type: "SET_DOCUMENT_FOCUS"; focus: DocumentFocusInput };

interface DocumentAstContextType {
    state: DocumentAST;
    dispatch: Dispatch<ASTAction>;
    /**
     * Commit a pre-computed forward/inverse `DocumentEvent` pair as a single
     * history entry. Used by the ProseMirror body editor so one transaction maps
     * to one undo step while reusing the same sync/mirror pipeline.
     */
    commitDocumentEvents: (
        forward: BackendDocumentEvent[],
        inverse: BackendDocumentEvent[],
    ) => void;
    isDirty: boolean;
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
    markSaved: () => void;
}

interface DocumentSyncContextType {
    events: QueuedDocumentEvent[];
    sessionId: number;
    bootstrapFiles: ProjectFile[] | null;
    ackDocumentEvents: (upToEventId: number) => void;
    eventsVersion: number;
    lastEventId: number;
}

interface DocumentFocusContextType {
    documentFocus: DocumentFocusState;
    setDocumentFocus: (focus: DocumentFocusInput) => void;
}

const DocumentAstContext = createContext<DocumentAstContextType | undefined>(
    undefined,
);
const DocumentSyncContext = createContext<DocumentSyncContextType | undefined>(
    undefined,
);
const DocumentFocusContext = createContext<DocumentFocusContextType | undefined>(
    undefined,
);

/**
 * A selector-capable view of the AST. React context re-renders every consumer
 * when its value changes, so reading the whole AST through `useDocumentAst`
 * re-renders on every keystroke. This store lets a component subscribe to just
 * the slice it reads (via `useDocumentAstSelector`) and re-render only when that
 * slice changes — keeping the per-keystroke commit from re-rendering the whole
 * workspace, with no debouncing of the live caret sync.
 */
interface DocumentAstStore {
    subscribe: (listener: () => void) => () => void;
    getSnapshot: () => DocumentAST;
}

const DocumentAstStoreContext = createContext<DocumentAstStore | undefined>(
    undefined,
);

/**
 * Stable document mutators, separated from `DocumentAstContext` (whose value
 * changes on every commit). A component that only needs to dispatch — e.g. a
 * metadata form field that reads its own slice via `useDocumentAstSelector` —
 * gets `dispatch` here without subscribing to the changing AST value, so it
 * doesn't re-render on every keystroke elsewhere.
 */
interface DocumentActionsContextType {
    dispatch: Dispatch<ASTAction>;
    commitDocumentEvents: (
        forward: BackendDocumentEvent[],
        inverse: BackendDocumentEvent[],
    ) => void;
    undo: () => void;
    redo: () => void;
    markSaved: () => void;
}

const DocumentActionsContext = createContext<
    DocumentActionsContextType | undefined
>(undefined);

interface DocumentProviderProps {
    children: ReactNode;
    historyLimit?: number;
}

const createInitialSessionState = (
    ast: DocumentAST = initialAST,
    sessionId = 1,
): DocumentSessionState => ({
    ast,
    past: [],
    future: [],
    events: [],
    nextEventId: 1,
    sessionId,
    bootstrapFiles: null,
    isDirty: false,
    documentFocus: {
        elementId: null,
        fieldId: null,
        caretUtf16Offset: null,
        sourceRevision: null,
        anchorPageNumber: null,
        forcePreviewScroll: false,
        focusSource: "programmatic",
        requestId: 0,
    },
});

const queueDocumentEvents = (
    events: BackendDocumentEvent[],
    nextEventId: number,
    timestamp: number,
): QueuedDocumentEvent[] =>
    events.map((event, index) => ({
        id: nextEventId + index,
        event,
        timestamp,
    }));

const createSessionReducer =
    (historyLimit: number) =>
    (
        state: DocumentSessionState,
        action: DocumentSessionAction,
    ): DocumentSessionState => {
        if (action.type === "UNDO") {
            const previous = state.past[state.past.length - 1];
            if (!previous) {
                return state;
            }

            return {
                ...state,
                ast: applyDocumentEvents(state.ast, previous.inverseEvents),
                past: state.past.slice(0, -1),
                future: [previous, ...state.future],
                events: [
                    ...state.events,
                    ...queueDocumentEvents(
                        previous.inverseEvents,
                        state.nextEventId,
                        Date.now(),
                    ),
                ],
                nextEventId: state.nextEventId + previous.inverseEvents.length,
                isDirty: true,
            };
        }

        if (action.type === "REDO") {
            const next = state.future[0];
            if (!next) {
                return state;
            }

            return {
                ...state,
                ast: applyDocumentEvents(state.ast, next.forwardEvents),
                past: [...state.past, next].slice(-historyLimit),
                future: state.future.slice(1),
                events: [
                    ...state.events,
                    ...queueDocumentEvents(
                        next.forwardEvents,
                        state.nextEventId,
                        Date.now(),
                    ),
                ],
                nextEventId: state.nextEventId + next.forwardEvents.length,
                isDirty: true,
            };
        }

        if (action.type === "COMMIT_EVENTS") {
            if (action.forward.length === 0) {
                return state;
            }

            const nextAst = applyDocumentEvents(state.ast, action.forward);
            const historyEntry: DocumentEventHistoryEntry = {
                forwardEvents: action.forward,
                inverseEvents: action.inverse,
                timestamp: Date.now(),
            };

            return {
                ...state,
                ast: nextAst,
                past: [...state.past, historyEntry].slice(-historyLimit),
                future: [],
                events: [
                    ...state.events,
                    ...queueDocumentEvents(
                        action.forward,
                        state.nextEventId,
                        historyEntry.timestamp,
                    ),
                ],
                nextEventId: state.nextEventId + action.forward.length,
                isDirty: true,
            };
        }

        if (action.type === "MARK_SAVED") {
            return {
                ...state,
                isDirty: false,
            };
        }

        if (action.type === "ACK_DOCUMENT_EVENTS") {
            return {
                ...state,
                events: state.events.filter(
                    (event) => event.id > action.upToEventId,
                ),
            };
        }

        if (action.type === "SET_DOCUMENT_FOCUS") {
            return {
                ...state,
                documentFocus: {
                    ...action.focus,
                    requestId: state.documentFocus.requestId + 1,
                },
            };
        }

        const nextAST = astReducer(state.ast, action.action);

        if (
            action.action.type !== "LOAD_DOCUMENT" &&
            nextAST !== state.ast &&
            !shouldCommitAstAction(state.ast, action.action, nextAST)
        ) {
            return state;
        }

        if (action.action.type === "LOAD_DOCUMENT") {
            return {
                ...createInitialSessionState(nextAST, state.sessionId + 1),
                ast: nextAST,
                bootstrapFiles: action.action.payload.projectFiles ?? null,
            };
        }

        if (nextAST === state.ast) {
            return state;
        }

        const historyEntry = createDocumentEventHistoryEntry(
            state.ast,
            action.action,
            nextAST,
        );
        const eventAppliedAst = applyDocumentEvents(
            state.ast,
            historyEntry.forwardEvents,
        );

        return {
            ...state,
            ast: eventAppliedAst,
            past: [...state.past, historyEntry].slice(-historyLimit),
            future: [],
            events: [
                ...state.events,
                ...queueDocumentEvents(
                    historyEntry.forwardEvents,
                    state.nextEventId,
                    historyEntry.timestamp,
                ),
            ],
            nextEventId:
                state.nextEventId + historyEntry.forwardEvents.length,
            isDirty: true,
        };
    };

export const DocumentProvider = ({
    children,
    historyLimit = 100,
}: DocumentProviderProps) => {
    const [sessionState, sessionDispatch] = useReducer(
        createSessionReducer(historyLimit),
        undefined,
        createInitialSessionState,
    );
    const eventsVersionRef = useRef(0);

    // External store for slice subscriptions. `astRef` mirrors the latest AST so
    // selectors read fresh data during render (no tearing); listeners are flushed
    // after commit when the AST identity changes.
    const astRef = useRef(sessionState.ast);
    astRef.current = sessionState.ast;
    const astListenersRef = useRef(new Set<() => void>());
    useEffect(() => {
        for (const listener of astListenersRef.current) {
            listener();
        }
    }, [sessionState.ast]);
    const astStore = useRef<DocumentAstStore>({
        subscribe: (listener) => {
            astListenersRef.current.add(listener);
            return () => {
                astListenersRef.current.delete(listener);
            };
        },
        getSnapshot: () => astRef.current,
    }).current;

    const dispatch = useCallback(
        (action: ASTAction) =>
            sessionDispatch({ type: "APPLY_AST_ACTION", action }),
        [],
    );
    const commitDocumentEvents = useCallback(
        (forward: BackendDocumentEvent[], inverse: BackendDocumentEvent[]) =>
            sessionDispatch({ type: "COMMIT_EVENTS", forward, inverse }),
        [],
    );
    const undo = useCallback(() => {
        clearBodyReconcileSkip();
        sessionDispatch({ type: "UNDO" });
    }, []);
    const redo = useCallback(() => {
        clearBodyReconcileSkip();
        sessionDispatch({ type: "REDO" });
    }, []);
    const markSaved = useCallback(
        () => sessionDispatch({ type: "MARK_SAVED" }),
        [],
    );
    const setDocumentFocus = useCallback(
        (focus: DocumentFocusInput) =>
            sessionDispatch({ type: "SET_DOCUMENT_FOCUS", focus }),
        [],
    );
    const ackDocumentEvents = useCallback(
        (upToEventId: number) =>
            sessionDispatch({
                type: "ACK_DOCUMENT_EVENTS",
                upToEventId,
            }),
        [],
    );

    const astValue = useMemo(
        () => ({
            state: sessionState.ast,
            dispatch,
            commitDocumentEvents,
            isDirty: sessionState.isDirty,
            canUndo: sessionState.past.length > 0,
            canRedo: sessionState.future.length > 0,
            undo,
            redo,
            markSaved,
        }),
        [
            sessionState.ast,
            dispatch,
            commitDocumentEvents,
            sessionState.isDirty,
            sessionState.past.length,
            sessionState.future.length,
            undo,
            redo,
            markSaved,
        ],
    );

    // Stable across the whole session (every callback is a stable useCallback),
    // so action-only consumers never re-render from AST changes.
    const actionsValue = useMemo(
        () => ({ dispatch, commitDocumentEvents, undo, redo, markSaved }),
        [dispatch, commitDocumentEvents, undo, redo, markSaved],
    );

    const syncValue = useMemo(() => {
        eventsVersionRef.current += 1;
        const lastEventId =
            sessionState.events[sessionState.events.length - 1]?.id ?? 0;
        return {
            events: sessionState.events,
            sessionId: sessionState.sessionId,
            bootstrapFiles: sessionState.bootstrapFiles,
            ackDocumentEvents,
            eventsVersion: eventsVersionRef.current,
            lastEventId,
        };
    }, [
        sessionState.events,
        sessionState.sessionId,
        sessionState.bootstrapFiles,
        ackDocumentEvents,
    ]);

    const focusValue = useMemo(
        () => ({
            documentFocus: sessionState.documentFocus,
            setDocumentFocus,
        }),
        [sessionState.documentFocus, setDocumentFocus],
    );

    return (
        <DocumentAstStoreContext.Provider value={astStore}>
            <DocumentActionsContext.Provider value={actionsValue}>
                <DocumentAstContext.Provider value={astValue}>
                    <DocumentSyncContext.Provider value={syncValue}>
                        <DocumentFocusContext.Provider value={focusValue}>
                            {children}
                        </DocumentFocusContext.Provider>
                    </DocumentSyncContext.Provider>
                </DocumentAstContext.Provider>
            </DocumentActionsContext.Provider>
        </DocumentAstStoreContext.Provider>
    );
};

export const useDocumentAst = (): DocumentAstContextType => {
    const context = useContext(DocumentAstContext);
    if (context === undefined) {
        throw new Error("useDocumentAst must be used within a DocumentProvider");
    }
    return context;
};

/**
 * Subscribe to a slice of the AST. The component re-renders only when the
 * selected value changes (per `isEqual`, default `Object.is`), instead of on
 * every AST commit. Use for read-only consumers of stable-ish slices (e.g. the
 * sidebar's references) so typing in the body doesn't re-render them.
 */
export function useDocumentAstSelector<T>(
    selector: (ast: DocumentAST) => T,
    isEqual: (a: T, b: T) => boolean = Object.is,
): T {
    const store = useContext(DocumentAstStoreContext);
    if (store === undefined) {
        throw new Error(
            "useDocumentAstSelector must be used within a DocumentProvider",
        );
    }
    const selectorRef = useRef(selector);
    selectorRef.current = selector;
    const isEqualRef = useRef(isEqual);
    isEqualRef.current = isEqual;
    const cacheRef = useRef<{ value: T } | null>(null);

    const getSelection = useCallback(() => {
        const next = selectorRef.current(store.getSnapshot());
        const cache = cacheRef.current;
        if (cache && isEqualRef.current(cache.value, next)) {
            return cache.value;
        }
        cacheRef.current = { value: next };
        return next;
    }, [store]);

    return useSyncExternalStore(store.subscribe, getSelection, getSelection);
}

/** Stable document mutators that never change identity across the session. */
export const useDocumentActions = (): DocumentActionsContextType => {
    const context = useContext(DocumentActionsContext);
    if (context === undefined) {
        throw new Error(
            "useDocumentActions must be used within a DocumentProvider",
        );
    }
    return context;
};

export const useDocumentSync = (): DocumentSyncContextType => {
    const context = useContext(DocumentSyncContext);
    if (context === undefined) {
        throw new Error(
            "useDocumentSync must be used within a DocumentProvider",
        );
    }
    return context;
};

export const useDocumentFocus = (): DocumentFocusContextType => {
    const context = useContext(DocumentFocusContext);
    if (context === undefined) {
        throw new Error(
            "useDocumentFocus must be used within a DocumentProvider",
        );
    }
    return context;
};

/** @deprecated Prefer useDocumentAst, useDocumentSync, or useDocumentFocus */
export const useDocument = () => {
    const ast = useDocumentAst();
    const sync = useDocumentSync();
    const focus = useDocumentFocus();
    return {
        ...ast,
        ...sync,
        ...focus,
    };
};
