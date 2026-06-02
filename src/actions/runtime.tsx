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
import { buildActionContextSnapshot } from "../editor/buildActionContextSnapshot";
import { captureBodyTabKey, getActiveBodyView } from "../editor/prosemirror/activeView";
import { runBodyTab } from "../editor/prosemirror/bodyTabCommand";
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

/** Content column (`ActionContextProvider` id `editor`). Tab must not leave via browser focus navigation. */
const EDITOR_COLUMN_SELECTOR = '[data-action-context-id="editor"]';

const isInEditorColumn = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement &&
    Boolean(target.closest(EDITOR_COLUMN_SELECTOR));

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

            const tabKey = normalizeKey(event.key) === "tab";
            const inEditorColumn = isInEditorColumn(event.target);
            if (tabKey) {
                captureBodyTabKey(event);
                if (inEditorColumn) {
                    const view = getActiveBodyView();
                    const targetNode =
                        event.target instanceof Node ? event.target : null;
                    const inBodySurface =
                        view !== null &&
                        targetNode !== null &&
                        view.dom.contains(targetNode);
                    // Run before preventDefault: in WebView, swallowing Tab in capture
                    // can prevent ProseMirror from seeing the key at all (Ctrl+Enter
                    // is not swallowed and worked).
                    if (inBodySurface) {
                        const handled = runBodyTab(view, {
                            shiftKey: event.shiftKey,
                            ctrlKey: event.ctrlKey,
                            metaKey: event.metaKey,
                        });
                        if (handled) {
                            event.preventDefault();
                            event.stopPropagation();
                            return;
                        }
                    }
                    event.preventDefault();
                }
            }

            const logicalEvent = eventToLogicalKeyEvent(event);
            const targetIsEditable = isEditableTarget(event.target);
            // Suppress the browser default for app shortcuts when focus is not on
            // an editable surface. Track that we did this ourselves so the resolver
            // below can still run — its `defaultPrevented` bail is meant to detect a
            // synchronous downstream handler (ProseMirror/input), not our own call.
            let preventedBySelf = false;
            if (!targetIsEditable && (event.ctrlKey || event.metaKey || event.altKey)) {
                event.preventDefault();
                preventedBySelf = true;
            }

            // Inside the ProseMirror body, two classes of keystroke are owned by
            // the action runtime and must not also produce native input:
            //  - Bold/Italic/Underline (editor::Bold/Italic/Underline). The
            //    browser's execCommand would also toggle them — Ctrl+U flashed on
            //    (native <u>) then off (the runtime's toggleMark).
            //  - Ctrl+Alt chords (editor::Insert*). On AltGr layouts Ctrl+Alt is
            //    AltGr and types a symbol (Ctrl+Alt+Q -> "@") instead of letting
            //    the runtime insert a quote.
            // Block native ONLY inside the body surface; plain contenteditable
            // fields (captions, template inputs) keep their behavior. Tracked via
            // `preventedBySelf` so the resolver below still runs.
            const markKey = normalizeKey(event.key);
            const isMarkShortcut =
                (event.ctrlKey || event.metaKey) &&
                !event.altKey &&
                !event.shiftKey &&
                (markKey === "b" || markKey === "i" || markKey === "u");
            const isAltGrChord = event.ctrlKey && event.altKey;
            const bodyView = getActiveBodyView();
            const targetNode =
                event.target instanceof Node ? event.target : null;
            const inBodySurface =
                bodyView !== null &&
                targetNode !== null &&
                bodyView.dom.contains(targetNode);
            if (inBodySurface && (isMarkShortcut || isAltGrChord)) {
                event.preventDefault();
                preventedBySelf = true;
            }

            const isPlainTextInput =
                targetIsEditable &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey &&
                event.key.length === 1;

            if (isPlainTextInput) {
                return;
            }

            // Resolve keys after the target (ProseMirror, inputs, …) runs so synchronous
            // handlers can call preventDefault first. The capture listener used to start
            // async dispatch here, which raced Ctrl+Enter: PM entered edit mode, then
            // `editor::EnterTable` called `view.focus()` and pulled focus off the block.
            queueMicrotask(() => {
                // Tab is always preventDefault'd in the editor column to trap focus;
                // still resolve Shift+Tab (template field) via the action runtime.
                // Anything we preventDefault'd ourselves (`preventedBySelf`) must
                // still resolve — that bail is only for a synchronous downstream
                // handler (ProseMirror/input) that already consumed the event.
                if (event.defaultPrevented && !preventedBySelf && !tabKey) {
                    return;
                }

                const snapshot = buildActionContextSnapshot(
                    event.target,
                    getSnapshot,
                );

                void TauriApi.resolveKeyEvent(logicalEvent, snapshot)
                    .then((resolution) => {
                        if (resolution.status === "matched") {
                            void dispatchAction(resolution.invocation).then((handled) => {
                                if (handled) {
                                    event.preventDefault();
                                }
                            });
                            return;
                        }

                        if (resolution.status === "pendingSequence") {
                            if (resolution.fallback) {
                                pendingFallbackTimeoutRef.current = window.setTimeout(
                                    () => {
                                        void TauriApi.resetKeySequence("main");
                                        void dispatchAction(resolution.fallback!).then(
                                            (handled) => {
                                                if (handled) {
                                                    event.preventDefault();
                                                }
                                            },
                                        );
                                    },
                                    resolution.timeout_ms,
                                );
                            } else {
                                event.preventDefault();
                            }
                        }
                    })
                    .catch(() => undefined);
            });
        };

        window.addEventListener("keydown", handleKeyDown, true);
        return () => {
            clearPendingFallback();
            window.removeEventListener("keydown", handleKeyDown, true);
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
