import { forwardRef, memo, type HTMLAttributes } from "react";
import styles from "./RichTextEditable.module.css";

export type RichTextEditableVariant = "default" | "document";

export interface RichTextEditableProps
    extends Omit<HTMLAttributes<HTMLDivElement>, "contentEditable"> {
    variant?: RichTextEditableVariant;
}

export const RichTextEditable = memo(
    forwardRef<HTMLDivElement, RichTextEditableProps>(
        ({ variant = "default", className = "", ...props }, ref) => (
            <div
                ref={ref}
                className={[
                    styles.editor,
                    variant === "document" ? styles.documentEditor : "",
                    className,
                ]
                    .filter(Boolean)
                    .join(" ")}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline={true}
                {...props}
            />
        ),
    ),
);

RichTextEditable.displayName = "RichTextEditable";
