import type { MutableRefObject } from "react";
import type { ExtraFieldSpec } from "../../../../bindings/ExtraFieldSpec";
import type { WrapperHostElement } from "../../../../editor/wrapperFields";
import { AnnotationFieldInput } from "./AnnotationFieldInput";
import styles from "../ElementEditor.module.css";

export const ElementAnnotationFields = ({
    element,
    fields,
    draftRef,
}: {
    element: WrapperHostElement;
    fields: ExtraFieldSpec[];
    draftRef?: MutableRefObject<Record<string, string>>;
}) => (
    <div className={styles.annotationFields}>
        {fields.map((field) => (
            <AnnotationFieldInput
                draftRef={draftRef}
                element={element}
                field={field}
                key={field.key}
            />
        ))}
    </div>
);

