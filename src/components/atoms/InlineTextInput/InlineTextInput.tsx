import {
    InputHTMLAttributes,
    TextareaHTMLAttributes,
    forwardRef,
    memo,
    type Ref,
} from "react";
import styles from "./InlineTextInput.module.css";

type SharedProps = {
    variant?: "chip" | "inlineComposer";
    className?: string;
};

export type InlineTextInputProps = SharedProps &
    (
        | ({ wrap?: false } & InputHTMLAttributes<HTMLInputElement>)
        | ({ wrap: true } & TextareaHTMLAttributes<HTMLTextAreaElement>)
    );

export const InlineTextInput = memo(
    forwardRef<HTMLInputElement | HTMLTextAreaElement, InlineTextInputProps>(
        ({ variant = "chip", wrap = false, className = "", ...props }, ref) => {
            const classNames = [
                styles.input,
                styles[variant],
                wrap ? styles.chipWrap : "",
                className,
            ]
                .filter(Boolean)
                .join(" ");

            if (wrap) {
                const { rows = 1, ...textareaProps } =
                    props as TextareaHTMLAttributes<HTMLTextAreaElement>;
                return (
                    <textarea
                        ref={ref as Ref<HTMLTextAreaElement>}
                        rows={rows}
                        className={classNames}
                        {...textareaProps}
                    />
                );
            }

            return (
                <input
                    ref={ref as Ref<HTMLInputElement>}
                    className={classNames}
                    {...(props as InputHTMLAttributes<HTMLInputElement>)}
                />
            );
        },
    ),
);

InlineTextInput.displayName = "InlineTextInput";
