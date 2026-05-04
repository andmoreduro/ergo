import {
    createContext,
    type CSSProperties,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { TauriApi } from "../api/tauri";
import type { ActionContextNode } from "../bindings/ActionContextNode";
import type { ActionContextSnapshot } from "../bindings/ActionContextSnapshot";
import type { ActionId } from "../bindings/ActionId";
import type { ActionInvocation } from "../bindings/ActionInvocation";
import type { KeyModifier } from "../bindings/KeyModifier";
import type { LogicalKeyEvent } from "../bindings/LogicalKeyEvent";

export type ActionHandler = (
    invocation: ActionInvocation,
) => boolean | void | Promise<boolean | void>;

export type ActionHandlerMap = Partial<Record<ActionId, ActionHandler>>;

interface RegisteredContextNode extends ActionContextNode {
    handlers: ActionHandlerMap;
}

interface ActionRuntimeValue {
    dispatchAction: (invocation: ActionInvocation) => Promise<boolean>;
    registerContext: (node: RegisteredContextNode) => void;
    unregisterContext: (id: string) => void;
    setFocusedContext: (id: string) => void;
    getSnapshot: (options?: { includeInputContext?: boolean }) => ActionContextSnapshot;
}

const ActionRuntimeContext = createContext<ActionRuntimeValue | null>(null);
const ParentActionContext = createContext<string | null>(null);

const contextHostStyle: CSSProperties = { display: "contents" };

const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return Boolean(
        target.closest(
            "input, textarea, select, [contenteditable='true'], [contenteditable='']",
        ),
    );
};

const normalizeKey = (key: string): string => {
    if (key === " " || key === "Spacebar") {
        return "space";
    }

    if (key.length === 1) {
        return key.toLocaleLowerCase();
    }

    return key.toLowerCase();
};

const eventToLogicalKeyEvent = (event: KeyboardEvent): LogicalKeyEvent => {
    const modifiers: KeyModifier[] = [];
    if (event.ctrlKey) {
        modifiers.push("Control");
    }
    if (event.altKey) {
        modifiers.push("Alt");
    }
    if (event.shiftKey) {
        modifiers.push("Shift");
    }
    if (event.metaKey) {
        modifiers.push("Meta");
    }

    return {
        window_id: "main",
        key: normalizeKey(event.key),
        modifiers,
    };
};

export const ActionRuntimeProvider = ({ children }: { children: ReactNode }) => {
    const nodesRef = useRef(new Map<string, RegisteredContextNode>());
    const [focusedContextId, setFocusedContextId] = useState<string>("app");
    const pendingFallbackTimeoutRef = useRef<number | null>(null);

    const registerContext = useCallback((node: RegisteredContextNode) => {
        nodesRef.current.set(node.id, node);
    }, []);

    const unregisterContext = useCallback((id: string) => {
        nodesRef.current.delete(id);
    }, []);

    const setFocusedContext = useCallback((id: string) => {
        setFocusedContextId(id);
    }, []);

    const getSnapshot = useCallback(
        (options?: { includeInputContext?: boolean }): ActionContextSnapshot => {
            const nodes = Array.from(nodesRef.current.values()).map(
                ({ handlers: _handlers, ...node }) => node,
            );
            const focusId =
                nodesRef.current.has(focusedContextId) || focusedContextId === "app"
                    ? focusedContextId
                    : "app";

            if (options?.includeInputContext) {
                nodes.push({
                    id: "active-input",
                    parent_id: focusId,
                    contexts: ["input"],
                    attributes: {},
                });

                return {
                    window_id: "main",
                    focused_context_id: "active-input",
                    nodes,
                };
            }

            return {
                window_id: "main",
                focused_context_id: focusId,
                nodes,
            };
        },
        [focusedContextId],
    );

    const dispatchAction = useCallback(
        async (invocation: ActionInvocation) => {
            let currentId: string | null =
                getSnapshot().focused_context_id ?? focusedContextId;

            while (currentId) {
                const node = nodesRef.current.get(currentId);
                const handler = node?.handlers[invocation.id];
                if (handler) {
                    const handled = await handler(invocation);
                    if (handled !== false) {
                        return true;
                    }
                }
                currentId = node?.parent_id ?? null;
            }

            return false;
        },
        [focusedContextId, getSnapshot],
    );

    useEffect(() => {
        const clearPendingFallback = () => {
            if (pendingFallbackTimeoutRef.current !== null) {
                window.clearTimeout(pendingFallbackTimeoutRef.current);
                pendingFallbackTimeoutRef.current = null;
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (typeof TauriApi.resolveKeyEvent !== "function") {
                return;
            }

            clearPendingFallback();

            const logicalEvent = eventToLogicalKeyEvent(event);
            const targetIsEditable = isEditableTarget(event.target);
            if (!targetIsEditable && (event.ctrlKey || event.metaKey || event.altKey)) {
                event.preventDefault();
            }
            const snapshot = getSnapshot({
                includeInputContext: targetIsEditable,
            });

            void TauriApi.resolveKeyEvent(logicalEvent, snapshot)
                .then((resolution) => {
                    if (resolution.status === "matched") {
                        event.preventDefault();
                        void dispatchAction(resolution.invocation);
                        return;
                    }

                    if (resolution.status === "pendingSequence") {
                        event.preventDefault();

                        if (resolution.fallback) {
                            pendingFallbackTimeoutRef.current = window.setTimeout(
                                () => {
                                    void TauriApi.resetKeySequence("main");
                                    void dispatchAction(resolution.fallback!);
                                },
                                resolution.timeout_ms,
                            );
                        }
                    }
                })
                .catch(() => undefined);
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            clearPendingFallback();
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [dispatchAction, getSnapshot]);

    const value = useMemo<ActionRuntimeValue>(
        () => ({
            dispatchAction,
            registerContext,
            unregisterContext,
            setFocusedContext,
            getSnapshot,
        }),
        [
            dispatchAction,
            getSnapshot,
            registerContext,
            setFocusedContext,
            unregisterContext,
        ],
    );

    return (
        <ActionRuntimeContext.Provider value={value}>
            {children}
        </ActionRuntimeContext.Provider>
    );
};

export interface ActionContextProviderProps {
    id: string;
    contexts: string[];
    attributes?: Record<string, string>;
    handlers?: ActionHandlerMap;
    children: ReactNode;
}

export const ActionContextProvider = ({
    id,
    contexts,
    attributes = {},
    handlers = {},
    children,
}: ActionContextProviderProps) => {
    const runtime = useContext(ActionRuntimeContext);
    const parentId = useContext(ParentActionContext);

    useEffect(() => {
        if (!runtime) {
            return undefined;
        }

        runtime.registerContext({
            id,
            parent_id: parentId,
            contexts,
            attributes,
            handlers,
        });

        return () => runtime.unregisterContext(id);
    }, [attributes, contexts, handlers, id, parentId, runtime]);

    if (!runtime) {
        return <>{children}</>;
    }

    return (
        <ParentActionContext.Provider value={id}>
            <div
                data-action-context-id={id}
                onFocusCapture={() => runtime.setFocusedContext(id)}
                onMouseDownCapture={() => runtime.setFocusedContext(id)}
                style={contextHostStyle}
            >
                {children}
            </div>
        </ParentActionContext.Provider>
    );
};

export const useActionDispatcher = () => {
    const runtime = useContext(ActionRuntimeContext);
    return runtime?.dispatchAction ?? (async () => false);
};

export const useActiveActionContext = () => {
    const runtime = useContext(ActionRuntimeContext);
    return (
        runtime?.getSnapshot ??
        (() => ({
            window_id: "main",
            focused_context_id: "app",
            nodes: [],
        }))
    );
};
