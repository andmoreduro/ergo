import { memo, type ReactNode } from "react";
import { FieldLabel } from "../../atoms/FieldLabel/FieldLabel";
import styles from "./FormField.module.css";

export interface FormFieldProps {
    label: string;
    children: ReactNode;
    htmlFor?: string;
}

export const FormField = memo(({ label, children, htmlFor }: FormFieldProps) => (
    <div className={styles.field}>
        <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
        <div className={styles.control}>{children}</div>
    </div>
));

FormField.displayName = "FormField";
