import { InputHTMLAttributes, forwardRef, useId, memo, type ReactNode } from 'react';
import { FieldLabel, type FieldImportance } from '../FieldLabel/FieldLabel';
import styles from './TextInput.module.css';

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /**
   * Optional label for the input
   */
  label?: string;
  /**
   * Required, recommended, or optional — shown as a colored asterisk with tooltip.
   */
  importance?: FieldImportance;
  /**
   * Optional error message to display below the input
   */
  error?: string;
  /**
   * If true, the input spans the full width of its container
   * @default false
   */
  fullWidth?: boolean;
  /**
   * Visual variant for specialized surfaces.
   * @default "default"
   */
  variant?: "default" | "borderless" | "toolbarZoom";
  /**
   * Non-editable text shown after the input (e.g. a fixed file extension).
   */
  suffix?: ReactNode;
  /**
   * Accessible name for the suffix (e.g. that a file extension is fixed).
   */
  suffixAriaLabel?: string;
}

export const TextInput = memo(forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      label,
      importance,
      error,
      fullWidth = false,
      variant = "default",
      suffix,
      suffixAriaLabel,
      className = '',
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const defaultId = useId();
    const suffixId = useId();
    const inputId = id || defaultId;

    const containerClassNames = [
      styles.container,
      fullWidth ? styles.fullWidth : '',
      variant === "borderless" ? styles.borderless : '',
      variant === "toolbarZoom" ? styles.toolbarZoom : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const inputClassNames = [
      styles.input,
      suffix ? styles.inputWithSuffix : '',
      error ? styles.inputError : '',
      disabled ? styles.disabled : '',
    ]
      .filter(Boolean)
      .join(' ');

    const describedBy = [
      suffix ? suffixId : undefined,
      error ? `${inputId}-error` : undefined,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    const input = (
      <input
        ref={ref}
        id={inputId}
        className={inputClassNames}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        {...props}
      />
    );

    return (
      <div className={containerClassNames}>
        {label && (
          <FieldLabel htmlFor={inputId} importance={importance}>
            {label}
          </FieldLabel>
        )}
        {suffix ? (
          <div
            className={[
              styles.inputRow,
              error ? styles.inputRowError : '',
              disabled ? styles.inputRowDisabled : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {input}
            <span
              className={styles.suffix}
              id={suffixId}
              aria-label={suffixAriaLabel}
            >
              {suffix}
            </span>
          </div>
        ) : (
          input
        )}
        {error && (
          <span id={`${inputId}-error`} className={styles.errorMessage}>
            {error}
          </span>
        )}
      </div>
    );
  }
));

TextInput.displayName = 'TextInput';
