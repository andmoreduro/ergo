import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    type Dispatch,
    type RefObject,
    type SetStateAction,
} from "react";
import {
    clientPointInsideElement,
    pointerDistance,
    preservePreviewScrollAtClientPoint,
    syncCaretAnchorInPreviewViewport,
    zoomFromPinchScale,
    zoomFromWheelDelta,
} from "../preview/previewZoomInput";

type GestureLikeEvent = Event & { scale: number; preventDefault: () => void };

function isZoomWheel(event: WheelEvent): boolean {
    return event.ctrlKey || event.metaKey;
}

/**
 * Ctrl/meta + wheel and pinch gestures on the preview scroll viewport.
 * Updates zoom every event for smooth CSS scaling; WASM rasterization stays debounced upstream.
 *
 * Returns `setZoomAnchor` — call before a programmatic zoom change (e.g. toolbar +/−)
 * to anchor the scroll on the caret/cursor. The actual scroll correction runs in a
 * `useLayoutEffect` after React commits the new zoom to the DOM.
 */
export function usePreviewZoomInput(
    scrollRef: RefObject<HTMLElement | null>,
    zoom: number,
    onZoomChange: Dispatch<SetStateAction<number>>,
): { setZoomAnchor: () => void } {
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;

    const prevZoomRef = useRef(zoom);
    const pendingAnchorRef = useRef<{ x: number; y: number } | null>(null);

    useLayoutEffect(() => {
        const prev = prevZoomRef.current;
        prevZoomRef.current = zoom;

        const anchor = pendingAnchorRef.current;
        const element = scrollRef.current;
        if (!anchor || !element || prev === zoom) {
            return;
        }
        pendingAnchorRef.current = null;

        preservePreviewScrollAtClientPoint(element, prev, zoom, anchor.x, anchor.y);
    }, [zoom, scrollRef]);

    const setZoomAnchor = useCallback(() => {
        const element = scrollRef.current;
        if (!element) {
            return;
        }
        const caretAnchor = syncCaretAnchorInPreviewViewport(element);
        if (caretAnchor) {
            pendingAnchorRef.current = caretAnchor;
            return;
        }
        const rect = element.getBoundingClientRect();
        pendingAnchorRef.current = {
            x: rect.left + rect.width * 0.5,
            y: rect.top + rect.height * 0.5,
        };
    }, [scrollRef]);

    useEffect(() => {
        const element = scrollRef.current;
        if (!element) {
            return;
        }

        const resolveZoomAnchor = (
            clientX: number,
            clientY: number,
        ): { x: number; y: number } => {
            const caretAnchor = syncCaretAnchorInPreviewViewport(element);
            if (caretAnchor) {
                return caretAnchor;
            }
            if (clientPointInsideElement(element, clientX, clientY)) {
                return { x: clientX, y: clientY };
            }
            const rect = element.getBoundingClientRect();
            return { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.5 };
        };

        const onWheel = (event: WheelEvent) => {
            if (!isZoomWheel(event)) {
                return;
            }

            event.preventDefault();
            pendingAnchorRef.current = resolveZoomAnchor(event.clientX, event.clientY);
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
            pendingAnchorRef.current =
                syncCaretAnchorInPreviewViewport(element) ?? pendingAnchorRef.current;
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
            pendingAnchorRef.current = clientPointInsideElement(
                element,
                midpoint.x,
                midpoint.y,
            )
                ? midpoint
                : (syncCaretAnchorInPreviewViewport(element) ?? midpoint);
            onZoomChange(() => zoomFromPinchScale(pinchBaseZoom, distance / pinchStartDistance));
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
    }, [onZoomChange, scrollRef]);

    return { setZoomAnchor };
}
