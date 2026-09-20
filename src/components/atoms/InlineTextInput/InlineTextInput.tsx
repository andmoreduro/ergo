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

/** Element handed to `ref`: an `<input>` unless `wrap` selects the `<textarea>` branch. */
export type InlineTextInputElement = HTMLInputElement | HTMLTextAreaElement;

// `wrap` is the discriminant between the two branches. The native textarea
// `wrap` attribute is omitted so it cannot collide with the boolean.
export type InlineTextInputProps = SharedProps &
    (
        | ({ wrap?: false } & InputHTMLAttributes<HTMLInputElement>)
        | ({ wrap: true } & Omit<
              TextareaHTMLAttributes<HTMLTextAreaElement>,
              "wrap"
          >)
    );

export const InlineTextInput = memo(
    forwardRef<InlineTextInputElement, InlineTextInputProps>(
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
