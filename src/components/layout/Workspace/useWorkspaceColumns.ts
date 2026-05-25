import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type PointerEventHandler,
} from "react";
import {
    applyHandleDrag,
    clampWorkspaceColumns,
    previewWidthFromColumns,
    rebalanceWorkspaceColumns,
    resolveHandleAtX,
    splitPositionsFromColumns,
    type WorkspaceColumnWidths,
} from "./workspaceColumns";

export const useWorkspaceColumns = () => {
    const rootRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const [columns, setColumns] = useState<WorkspaceColumnWidths | null>(null);
    const [activeHandle, setActiveHandle] = useState<0 | 1 | null>(null);
    const [hoveredHandle, setHoveredHandle] = useState<0 | 1 | null>(null);
    const dragHandleRef = useRef<0 | 1 | null>(null);
    const hasCustomLayoutRef = useRef(false);
    const lastContainerWidthRef = useRef(0);

    useLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) {
            return;
        }

        const syncWidth = () => {
            const width = root.getBoundingClientRect().width;
            setContainerWidth(width);
            setColumns((current) => {
                if (!current) {
                    return rebalanceWorkspaceColumns(width, {
                        sidebar: 250,
                        editor: 400,
                    });
                }

                if (activeHandle !== null) {
                    return current;
                }

                if (!hasCustomLayoutRef.current) {
                    return rebalanceWorkspaceColumns(width, current);
                }

                const previousWidth = lastContainerWidthRef.current;
                if (previousWidth > 0 && width !== previousWidth) {
                    const delta = width - previousWidth;
                    const half = Math.floor(delta / 2);
                    return clampWorkspaceColumns(width, {
                        sidebar: current.sidebar,
                        editor: current.editor + half,
                    });
                }

                return current;
            });
            lastContainerWidthRef.current = width;
        };

        syncWidth();

        if (typeof ResizeObserver === "undefined") {
            return;
        }

        const observer = new ResizeObserver(() => {
            syncWidth();
        });

        observer.observe(root);
        return () => observer.disconnect();
    }, [activeHandle]);

    useEffect(() => {
        if (activeHandle === null) {
            return;
        }

        const onPointerMove = (event: PointerEvent) => {
            const root = rootRef.current;
            if (!root || dragHandleRef.current === null) {
                return;
            }

            const rect = root.getBoundingClientRect();

            setColumns((current) => {
                if (!current) {
                    return current;
                }

                const { split1, split2 } = splitPositionsFromColumns(current);
                const handleAtPointer = resolveHandleAtX(
                    rect.left,
                    event.clientX,
                    split1,
                    split2,
                );
                const handleIndex = handleAtPointer ?? dragHandleRef.current;
                if (handleIndex === null) {
                    return current;
                }

                return applyHandleDrag(
                    rect.width,
                    current,
                    handleIndex,
                    event.clientX,
                    rect.left,
                );
            });
        };

        const onPointerUp = () => {
            dragHandleRef.current = null;
            setActiveHandle(null);
        };

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerUp);
        return () => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerUp);
        };
    }, [activeHandle]);

    const createHandlePointerDown = useCallback(
        (handleIndex: 0 | 1): PointerEventHandler<HTMLDivElement> =>
            (event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                dragHandleRef.current = handleIndex;
                hasCustomLayoutRef.current = true;
                setActiveHandle(handleIndex);
            },
        [],
    );

    const resolvedColumns = columns ?? { sidebar: 250, editor: 400 };
    const previewWidth =
        containerWidth > 0
            ? previewWidthFromColumns(containerWidth, resolvedColumns)
            : 400;

    const sidebarStyle = {
        width: resolvedColumns.sidebar,
        flexShrink: 0,
    } as const;

    const editorStyle = {
        width: resolvedColumns.editor,
        flexShrink: 0,
    } as const;

    const previewStyle = {
        width: previewWidth,
        flexShrink: 0,
        minWidth: 0,
    } as const;

    return {
        rootRef,
        containerWidth,
        columns: resolvedColumns,
        sidebarStyle,
        editorStyle,
        previewStyle,
        handle1: {
            active: activeHandle === 0 || hoveredHandle === 0,
            onPointerDown: createHandlePointerDown(0),
            onPointerEnter: () => setHoveredHandle(0),
            onPointerLeave: () =>
                setHoveredHandle((current) => (current === 0 ? null : current)),
        },
        handle2: {
            active: activeHandle === 1 || hoveredHandle === 1,
            onPointerDown: createHandlePointerDown(1),
            onPointerEnter: () => setHoveredHandle(1),
            onPointerLeave: () =>
                setHoveredHandle((current) => (current === 1 ? null : current)),
        },
    };
};
