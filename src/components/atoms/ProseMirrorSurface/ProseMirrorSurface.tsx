import { forwardRef } from "react";
import styles from "./ProseMirrorSurface.module.css";

/**
 * The DOM container a ProseMirror `EditorView` attaches to. ProseMirror sets
 * `contentEditable` on this element programmatically, so the raw editable
 * surface stays in the atoms layer per the component pattern. The organism owns
 * the editor lifecycle and drives the view into this node via the forwarded ref.
 */
export const ProseMirrorSurface = forwardRef<HTMLDivElement>((_props, ref) => (
    <div ref={ref} className={styles.surface} spellCheck={false} />
));

ProseMirrorSurface.displayName = "ProseMirrorSurface";
