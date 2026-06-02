import type { MutableRefObject } from "react";
import type { ExtraFieldSpec } from "../../../../bindings/ExtraFieldSpec";
import type { WrapperHostElement } from "../../../../editor/wrapperFields";
import { AnnotationFieldInput } from "./AnnotationFieldInput";
import styles from "../ElementEditor.module.css";

export const ElementAnnotationFields = ({
    element,
    fields,
    draftRef,
    tabIndexOffset = 0,
}: {
    element: WrapperHostElement;
    fields: ExtraFieldSpec[];
    draftRef?: MutableRefObject<Record<string, string>>;
    tabIndexOffset?: number;
}) => (
    <div className={styles.annotationFields}>
        {fields.map((field, index) => (
            <div
                data-wrapper-tab="extra"
                data-wrapper-tab-index={tabIndexOffset + index}
                key={field.key}
            >
                <AnnotationFieldInput
                    draftRef={draftRef}
                    element={element}
                    field={field}
                />
            </div>
        ))}
    </div>
);

