import {
    createContext,
    useContext,
    useReducer,
    ReactNode,
    Dispatch,
    useCallback,
    useMemo,
} from "react";
import { astReducer } from "./ast/reducer";
import type { ASTAction } from "./ast/actions";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentEvent as BackendDocumentEvent } from "../bindings/DocumentEvent";
import { createDefaultDocumentAST } from "./ast/defaults";
import {
    applyDocumentEventToAst,
    createDocumentEventHistoryEntry,
    type DocumentEventHistoryEntry,
} from "./documentEvents";

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
    isDirty: boolean;
    documentFocus: DocumentFocusState;
}

type DocumentSessionAction =
    | { type: "APPLY_AST_ACTION"; action: ASTAction }
    | { type: "UNDO" }
    | { type: "REDO" }
    | { type: "MARK_SAVED" }
    | { type: "ACK_DOCUMENT_EVENTS"; upToEventId: number }
    | { type: "SET_DOCUMENT_FOCUS"; focus: DocumentFocusInput };

interface DocumentContextType {
    state: DocumentAST;
    dispatch: Dispatch<ASTAction>;
    isDirty: boolean;
    canUndo: boolean;
    canRedo: boolean;
    documentFocus: DocumentFocusState;
    events: QueuedDocumentEvent[];
    sessionId: number;
    undo: () => void;
    redo: () => void;
    markSaved: () => void;
    ackDocumentEvents: (upToEventId: number) => void;
    setDocumentFocus: (focus: DocumentFocusInput) => void;
}

const DocumentContext = createContext<DocumentContextType | undefined>(
    undefined,
);

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
    isDirty: false,
    documentFocus: {
        elementId: null,
        fieldId: null,
        caretUtf16Offset: null,
        sourceRevision: null,
        focusSource: "programmatic",
        requestId: 0,
    },
});

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
                ast: applyDocumentEventToAst(state.ast, previous.inverseEvent),
                past: state.past.slice(0, -1),
                future: [previous, ...state.future],
                events: [
                    ...state.events,
                    {
                        id: state.nextEventId,
                        event: previous.inverseEvent,
                        timestamp: Date.now(),
                    },
                ],
                nextEventId: state.nextEventId + 1,
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
                ast: applyDocumentEventToAst(state.ast, next.forwardEvent),
                past: [...state.past, next].slice(-historyLimit),
                future: state.future.slice(1),
                events: [
                    ...state.events,
                    {
                        id: state.nextEventId,
                        event: next.forwardEvent,
                        timestamp: Date.now(),
                    },
                ],
                nextEventId: state.nextEventId + 1,
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

        if (action.action.type === "LOAD_DOCUMENT") {
            return {
                ...createInitialSessionState(nextAST, state.sessionId + 1),
                ast: nextAST,
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

        return {
            ...state,
            ast: nextAST,
            past: [...state.past, historyEntry].slice(-historyLimit),
            future: [],
            events: [
                ...state.events,
                {
                    id: state.nextEventId,
                    event: historyEntry.forwardEvent,
                    timestamp: historyEntry.timestamp,
                },
            ],
            nextEventId: state.nextEventId + 1,
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
    const dispatch = useCallback(
        (action: ASTAction) =>
            sessionDispatch({ type: "APPLY_AST_ACTION", action }),
        [],
    );
    const undo = useCallback(() => sessionDispatch({ type: "UNDO" }), []);
    const redo = useCallback(() => sessionDispatch({ type: "REDO" }), []);
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

    const contextValue = useMemo(
        () => ({
            state: sessionState.ast,
            dispatch,
            isDirty: sessionState.isDirty,
            canUndo: sessionState.past.length > 0,
            canRedo: sessionState.future.length > 0,
            documentFocus: sessionState.documentFocus,
            events: sessionState.events,
            sessionId: sessionState.sessionId,
            undo,
            redo,
            markSaved,
            ackDocumentEvents,
            setDocumentFocus,
        }),
        [
            sessionState.ast,
            dispatch,
            sessionState.isDirty,
            sessionState.past.length,
            sessionState.future.length,
            sessionState.documentFocus,
            sessionState.events,
            sessionState.sessionId,
            undo,
            redo,
            markSaved,
            ackDocumentEvents,
            setDocumentFocus,
        ],
    );

    return (
        <DocumentContext.Provider value={contextValue}>
            {children}
        </DocumentContext.Provider>
    );
};

export const useDocument = (): DocumentContextType => {
    const context = useContext(DocumentContext);
    if (context === undefined) {
        throw new Error("useDocument must be used within a DocumentProvider");
    }
    return context;
};
