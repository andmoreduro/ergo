import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    type Dispatch,
    type RefObject,
    type SetStateAction,
} from "react";
import { resolvePreviewZoomAnchor } from "../preview/previewPointerAnchor";
import {
    applyPreviewScrollAnchor,
    capturePreviewScrollAnchor,
    type PreviewScrollAnchor,
} from "../preview/previewScrollAnchor";
import {
    clientPointInsideElement,
    pointerDistance,
    zoomFromPinchScale,
    zoomFromWheelDelta,
} from "../preview/previewZoomInput";
import {
    previewZoomIn,
    previewZoomOut,
    registerPreviewZoomController,
} from "../preview/previewZoomBridge";
import { stepPreviewZoom } from "../preview/previewZoom";

type GestureLikeEvent = Event & { scale: number; preventDefault: () => void };

function isZoomWheel(event: WheelEvent): boolean {
    return event.ctrlKey || event.metaKey;
}

function resolveAnchorPoint(
    scrollRoot: HTMLElement,
    previewColumn: HTMLElement | null,
    clientX: number,
    clientY: number,
    preferPointer: boolean,
): { x: number; y: number } {
    if (preferPointer && clientPointInsideElement(scrollRoot, clientX, clientY)) {
        return { x: clientX, y: clientY };
    }
    return resolvePreviewZoomAnchor(scrollRoot, previewColumn);
}

/**
 * Ctrl/meta + wheel and pinch gestures on the preview scroll viewport.
 * Programmatic zoom uses the same anchor model via `previewZoomBridge`.
 */
export function usePreviewZoomInput(
    scrollRef: RefObject<HTMLElement | null>,
    horizontalScrollRef: RefObject<HTMLElement | null>,
    previewColumnRef: RefObject<HTMLElement | null>,
    zoom: number,
    onZoomChange: Dispatch<SetStateAction<number>>,
): { setZoomAnchor: () => void } {
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;

    const prevZoomRef = useRef(zoom);
    const pendingAnchorRef = useRef<PreviewScrollAnchor | null>(null);

    const captureAnchorAt = useCallback(
        (clientX: number, clientY: number) => {
            const element = scrollRef.current;
            if (!element) {
                return;
            }
            pendingAnchorRef.current = capturePreviewScrollAnchor(
                element,
                horizontalScrollRef.current,
                clientX,
                clientY,
            );
        },
        [horizontalScrollRef, scrollRef],
    );

    const setZoomAnchor = useCallback(() => {
        const element = scrollRef.current;
        if (!element) {
            return;
        }
        const point = resolvePreviewZoomAnchor(
            element,
            previewColumnRef.current,
        );
        captureAnchorAt(point.x, point.y);
    }, [captureAnchorAt, previewColumnRef, scrollRef]);

    useLayoutEffect(() => {
        const prev = prevZoomRef.current;
        prevZoomRef.current = zoom;

        const anchor = pendingAnchorRef.current;
        const element = scrollRef.current;
        if (!anchor || !element || prev === zoom) {
            return;
        }
        pendingAnchorRef.current = null;

        applyPreviewScrollAnchor(
            element,
            horizontalScrollRef.current,
            anchor,
        );
    }, [horizontalScrollRef, scrollRef, zoom]);

    useEffect(() => {
        registerPreviewZoomController({
            prepareAnchor: setZoomAnchor,
            zoomIn: () => {
                onZoomChange((current) => stepPreviewZoom(current, 1));
            },
            zoomOut: () => {
                onZoomChange((current) => stepPreviewZoom(current, -1));
            },
        });
        return () => registerPreviewZoomController(null);
    }, [onZoomChange, setZoomAnchor]);

    useEffect(() => {
        const element = scrollRef.current;
        if (!element) {
            return;
        }

        const onWheel = (event: WheelEvent) => {
            if (!isZoomWheel(event)) {
                return;
            }

            event.preventDefault();
            const point = resolveAnchorPoint(
                element,
                previewColumnRef.current,
                event.clientX,
                event.clientY,
                true,
            );
            captureAnchorAt(point.x, point.y);
            onZoomChange((current) =>
                zoomFromWheelDelta(current, event.deltaY, event.deltaMode),
            );
        };

        let gestureBaseZoom = zoomRef.current;

        const onGestureStart = (event: Event) => {
            const gesture = event as GestureLikeEvent;
            gesture.preventDefault();
            gestureBaseZoom = zoomRef.current;
        };

        const onGestureChange = (event: Event) => {
            const gesture = event as GestureLikeEvent;
            gesture.preventDefault();
            setZoomAnchor();
            onZoomChange(() => zoomFromPinchScale(gestureBaseZoom, gesture.scale));
        };

        const pointers = new Map<number, { x: number; y: number }>();
        let pinchStartDistance = 0;
        let pinchBaseZoom = zoomRef.current;
        let pinching = false;

        const syncPointer = (event: PointerEvent) => {
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        };

        const beginPinchIfReady = () => {
            if (pointers.size !== 2) {
                return;
            }
            const [first, second] = pointers.values();
            pinchStartDistance = pointerDistance(first, second);
            if (pinchStartDistance <= 0) {
                return;
            }
            pinchBaseZoom = zoomRef.current;
            pinching = true;
            element.style.touchAction = "none";
        };

        const endPinch = () => {
            if (!pinching) {
                return;
            }
            pinching = false;
            element.style.touchAction = "";
        };

        const onPointerDown = (event: PointerEvent) => {
            if (event.pointerType === "mouse") {
                return;
            }
            syncPointer(event);
            beginPinchIfReady();
        };

        const onPointerMove = (event: PointerEvent) => {
            if (!pointers.has(event.pointerId)) {
                return;
            }
            syncPointer(event);
            if (!pinching || pointers.size !== 2) {
                return;
            }

            const [first, second] = pointers.values();
            const distance = pointerDistance(first, second);
            if (distance <= 0 || pinchStartDistance <= 0) {
                return;
            }

            event.preventDefault();
            const midpoint = {
                x: (first.x + second.x) * 0.5,
                y: (first.y + second.y) * 0.5,
            };
            const point = clientPointInsideElement(
                element,
                midpoint.x,
                midpoint.y,
            )
                ? midpoint
                : resolvePreviewZoomAnchor(element, previewColumnRef.current);
            captureAnchorAt(point.x, point.y);
            onZoomChange(() =>
                zoomFromPinchScale(pinchBaseZoom, distance / pinchStartDistance),
            );
        };

        const releasePointer = (event: PointerEvent) => {
            pointers.delete(event.pointerId);
            if (pointers.size < 2) {
                endPinch();
            }
        };

        const onPointerUp = (event: PointerEvent) => {
            releasePointer(event);
        };

        const onPointerCancel = (event: PointerEvent) => {
            releasePointer(event);
        };

        const onGestureEnd = (event: Event) => {
            (event as GestureLikeEvent).preventDefault();
        };

        element.addEventListener("wheel", onWheel, { passive: false });
        element.addEventListener("gesturestart", onGestureStart);
        element.addEventListener("gesturechange", onGestureChange);
        element.addEventListener("gestureend", onGestureEnd);
        element.addEventListener("pointerdown", onPointerDown);
        element.addEventListener("pointermove", onPointerMove);
        element.addEventListener("pointerup", onPointerUp);
        element.addEventListener("pointercancel", onPointerCancel);

        return () => {
            element.removeEventListener("wheel", onWheel);
            element.removeEventListener("gesturestart", onGestureStart);
            element.removeEventListener("gesturechange", onGestureChange);
            element.removeEventListener("gestureend", onGestureEnd);
            element.removeEventListener("pointerdown", onPointerDown);
            element.removeEventListener("pointermove", onPointerMove);
            element.removeEventListener("pointerup", onPointerUp);
            element.removeEventListener("pointercancel", onPointerCancel);
            element.style.touchAction = "";
        };
    }, [
        captureAnchorAt,
        onZoomChange,
        previewColumnRef,
        scrollRef,
        setZoomAnchor,
    ]);

    return { setZoomAnchor };
}

export { previewZoomIn, previewZoomOut };
