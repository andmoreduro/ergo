import {
    createContext,
    useContext,
    useReducer,
    ReactNode,
    Dispatch,
    useCallback,
} from "react";
import { astReducer } from "./ast/reducer";
import type { ASTAction } from "./ast/actions";
import type { DocumentAST } from "../bindings/DocumentAST";
import { createDefaultDocumentAST } from "./ast/defaults";

const initialAST: DocumentAST = createDefaultDocumentAST();

export type DocumentEvent = {
    action: ASTAction;
    timestamp: number;
};

interface DocumentSessionState {
    ast: DocumentAST;
    past: DocumentAST[];
    future: DocumentAST[];
    events: DocumentEvent[];
    isDirty: boolean;
    activeElementId: string | null;
}

type DocumentSessionAction =
    | { type: "APPLY_AST_ACTION"; action: ASTAction }
    | { type: "UNDO" }
    | { type: "REDO" }
    | { type: "MARK_SAVED" }
    | { type: "SET_ACTIVE_ELEMENT"; elementId: string | null };

interface DocumentContextType {
    state: DocumentAST;
    dispatch: Dispatch<ASTAction>;
    isDirty: boolean;
    canUndo: boolean;
    canRedo: boolean;
    activeElementId: string | null;
    events: DocumentEvent[];
    undo: () => void;
    redo: () => void;
    markSaved: () => void;
    setActiveElementId: (elementId: string | null) => void;
}

const DocumentContext = createContext<DocumentContextType | undefined>(
    undefined,
);

interface DocumentProviderProps {
    children: ReactNode;
    historyLimit?: number;
}

const createInitialSessionState = (): DocumentSessionState => ({
    ast: initialAST,
    past: [],
    future: [],
    events: [],
    isDirty: false,
    activeElementId: null,
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
                ast: previous,
                past: state.past.slice(0, -1),
                future: [state.ast, ...state.future],
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
                ast: next,
                past: [...state.past, state.ast].slice(-historyLimit),
                future: state.future.slice(1),
                isDirty: true,
            };
        }

        if (action.type === "MARK_SAVED") {
            return {
                ...state,
                isDirty: false,
            };
        }

        if (action.type === "SET_ACTIVE_ELEMENT") {
            return {
                ...state,
                activeElementId: action.elementId,
            };
        }

        const nextAST = astReducer(state.ast, action.action);

        if (action.action.type === "LOAD_DOCUMENT") {
            return {
                ...createInitialSessionState(),
                ast: nextAST,
            };
        }

        if (nextAST === state.ast) {
            return state;
        }

        return {
            ...state,
            ast: nextAST,
            past: [...state.past, state.ast].slice(-historyLimit),
            future: [],
            events: [
                ...state.events,
                {
                    action: action.action,
                    timestamp: Date.now(),
                },
            ].slice(-historyLimit),
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
    const setActiveElementId = useCallback(
        (elementId: string | null) =>
            sessionDispatch({ type: "SET_ACTIVE_ELEMENT", elementId }),
        [],
    );

    return (
        <DocumentContext.Provider
            value={{
                state: sessionState.ast,
                dispatch,
                isDirty: sessionState.isDirty,
                canUndo: sessionState.past.length > 0,
                canRedo: sessionState.future.length > 0,
                activeElementId: sessionState.activeElementId,
                events: sessionState.events,
                undo,
                redo,
                markSaved,
                setActiveElementId,
            }}
        >
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
