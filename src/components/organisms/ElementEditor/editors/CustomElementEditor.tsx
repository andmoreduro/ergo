import { useTemplateSpecContext } from "../../../../state/TemplateSpecContext";
import { useDocumentAst } from "../../../../state/DocumentContext";
import type { CustomElementUnion } from "../types";
import { CustomElementFieldInput } from "../fields/CustomElementFieldInput";
import { useTemplateTranslation } from "../../../../hooks/useTemplateTranslation";
import styles from "../ElementEditor.module.css";

export const CustomElementEditor = ({
    element,
}: {
    element: CustomElementUnion;
}) => {
    const { dispatch } = useDocumentAst();
    const { spec: templateSpec } = useTemplateSpecContext();
    const t = useTemplateTranslation(templateSpec);
    const customElements = templateSpec?.editor?.custom_elements || [];
    const spec = customElements.find((candidate) => candidate.kind === element.element_type);

    if (!spec) {
        return (
            <div className={styles.placeholder}>
                Unknown custom element type: {element.element_type}
            </div>
        );
    }

    return (
        <>
            {(spec.fields || []).map((field) => (
                <CustomElementFieldInput
                    key={field.key}
                    elementId={element.id}
                    fieldKey={field.key}
                    label={t(field.label || field.key)}
                    committed={String(element.fields[field.key] ?? "")}
                    dispatch={dispatch}
                />
            ))}
        </>
    );
};

