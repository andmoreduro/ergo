import type { Importance } from "../../../bindings/Importance";
import { m } from "../../../paraglide/messages.js";
import styles from "./FieldLabel.module.css";

export type FieldImportance = Importance;

const importanceTitle = (importance: FieldImportance): string => {
    switch (importance) {
        case "required":
            return m.field_importance_required();
        case "recommended":
            return m.field_importance_recommended();
        case "optional":
            return m.field_importance_optional();
    }
};

export interface FieldLabelProps {
    htmlFor?: string;
    children: string;
    importance?: FieldImportance;
}

export const FieldLabel = ({ htmlFor, children, importance }: FieldLabelProps) => {
    const markerTitle = importance ? importanceTitle(importance) : undefined;
    const Tag = htmlFor ? "label" : "span";

    return (
        <Tag
            {...(htmlFor ? { htmlFor } : {})}
            className={styles.label}
            title={markerTitle}
        >
            {children}
            {importance === "required" && (
                <span
                    className={styles.requiredMarker}
                    title={markerTitle}
                    aria-label={markerTitle}
                >
                    *
                </span>
            )}
            {importance === "recommended" && (
                <span
                    className={styles.recommendedMarker}
                    title={markerTitle}
                    aria-label={markerTitle}
                >
                    *
                </span>
            )}
        </Tag>
    );
};
