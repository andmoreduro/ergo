import { forwardRef } from "react";

export interface ProseMirrorSurfaceProps {
    /**
     * Skip layout and paint of off-screen top-level blocks (see the
     * `data-ergo-virtualized` rules in `ProseMirrorSurface.module.css`).
     */
    virtualized?: boolean;
}

/**
 * Bare DOM mount for the body ProseMirror `EditorView`. Paper layout (min-height,
 * padding, shadow) is applied on the editor node itself through `EditorView`
 * attributes in `ProseMirrorBodyEditor`, not on this wrapper; the wrapper only
 * carries the virtualization switch.
 */
export const ProseMirrorSurface = forwardRef<HTMLDivElement, ProseMirrorSurfaceProps>(
    ({ virtualized = true }, ref) => (
        <div
            ref={ref}
            spellCheck={false}
            data-ergo-body-editor=""
            data-ergo-virtualized={virtualized ? "true" : "false"}
        />
    ),
);

ProseMirrorSurface.displayName = "ProseMirrorSurface";
