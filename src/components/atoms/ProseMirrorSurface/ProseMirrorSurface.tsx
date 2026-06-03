import { forwardRef } from "react";

/**
 * Bare DOM mount for the body ProseMirror `EditorView`. Paper layout (min-height,
 * padding, shadow) is applied on this same node through `EditorView` attributes
 * in `ProseMirrorBodyEditor`, not on a parent wrapper.
 */
export const ProseMirrorSurface = forwardRef<HTMLDivElement>((_props, ref) => (
    <div ref={ref} spellCheck={false} data-ergo-body-editor="" />
));

ProseMirrorSurface.displayName = "ProseMirrorSurface";
