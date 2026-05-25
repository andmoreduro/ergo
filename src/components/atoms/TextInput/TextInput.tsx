import { InputHTMLAttributes, forwardRef, useId, memo } from 'react';
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
}

export const TextInput = memo(forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      label,
      importance,
      error,
      fullWidth = false,
      className = '',
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const defaultId = useId();
    const inputId = id || defaultId;

    const containerClassNames = [
      styles.container,
      fullWidth ? styles.fullWidth : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const inputClassNames = [
      styles.input,
      error ? styles.inputError : '',
      disabled ? styles.disabled : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={containerClassNames}>
        {label && (
          <FieldLabel htmlFor={inputId} importance={importance}>
            {label}
          </FieldLabel>
        )}
        <input
          ref={ref}
          id={inputId}
          className={inputClassNames}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
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
