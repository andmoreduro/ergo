import {
    useEffect,
    useRef,
    type Dispatch,
    type RefObject,
    type SetStateAction,
} from "react";
import {
    pointerDistance,
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
 */
export function usePreviewZoomInput(
    scrollRef: RefObject<HTMLElement | null>,
    zoom: number,
    onZoomChange: Dispatch<SetStateAction<number>>,
): void {
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;

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
            onZoomChange(() =>
                zoomFromPinchScale(gestureBaseZoom, gesture.scale),
            );
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
            const scale = distance / pinchStartDistance;
            onZoomChange(() => zoomFromPinchScale(pinchBaseZoom, scale));
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
}
