import { InputHTMLAttributes, forwardRef, memo } from "react";
import styles from "./InlineTextInput.module.css";

export interface InlineTextInputProps extends InputHTMLAttributes<HTMLInputElement> {
    variant?: "chip" | "inlineComposer";
}

export const InlineTextInput = memo(
    forwardRef<HTMLInputElement, InlineTextInputProps>(
        ({ variant = "chip", className = "", ...props }, ref) => {
            const classNames = [styles.input, styles[variant], className]
                .filter(Boolean)
                .join(" ");

            return <input ref={ref} className={classNames} {...props} />;
        },
    ),
);

InlineTextInput.displayName = "InlineTextInput";
