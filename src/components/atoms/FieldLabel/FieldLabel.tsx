import type { Importance } from "../../../bindings/Importance";
import { m } from "../../../paraglide/messages.js";
import styles from "./FieldLabel.module.css";

export type FieldImportance = Importance;

const requiredTitle = () => m.field_importance_required();

export interface FieldLabelProps {
    htmlFor?: string;
    children: string;
    importance?: FieldImportance;
    className?: string;
}

export const FieldLabel = ({
    htmlFor,
    children,
    importance,
    className = "",
}: FieldLabelProps) => {
    const required = importance === "required";
    const markerTitle = required ? requiredTitle() : undefined;
    const Tag = htmlFor ? "label" : "span";

    return (
        <Tag
            {...(htmlFor ? { htmlFor } : {})}
            className={[styles.label, className].filter(Boolean).join(" ")}
        >
            {children}
            {required ? (
                <span
                    className={styles.requiredMarker}
                    title={markerTitle}
                    aria-label={markerTitle}
                >
                    *
                </span>
            ) : null}
        </Tag>
    );
};
