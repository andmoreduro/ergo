import { TextareaHTMLAttributes, forwardRef, useId, memo, useEffect, useRef } from 'react';
import { FieldLabel, type FieldImportance } from '../FieldLabel/FieldLabel';
import styles from './Textarea.module.css';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /**
   * Optional label for the textarea
   */
  label?: string;
  importance?: FieldImportance;
  /**
   * Optional error message to display below the textarea
   */
  error?: string;
  /**
   * If true, the textarea spans the full width of its container
   * @default false
   */
  fullWidth?: boolean;
}

export const Textarea = memo(forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      importance,
      error,
      fullWidth = false,
      className = '',
      id,
      disabled,
      rows = 1,
      ...props
    },
    ref
  ) => {
    const defaultId = useId();
    const textareaId = id || defaultId;
    const localRef = useRef<HTMLTextAreaElement | null>(null);

    const setRef = (node: HTMLTextAreaElement | null) => {
      localRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      }
    };

    const adjustHeight = () => {
      const textarea = localRef.current;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
      }
    };

    useEffect(() => {
      adjustHeight();
    }, [props.value]);

    const containerClassNames = [
      styles.container,
      fullWidth ? styles.fullWidth : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const textareaClassNames = [
      styles.textarea,
      error ? styles.textareaError : '',
      disabled ? styles.disabled : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={containerClassNames}>
        {label && (
          <FieldLabel htmlFor={textareaId} importance={importance}>
            {label}
          </FieldLabel>
        )}
        <textarea
          ref={setRef}
          id={textareaId}
          className={textareaClassNames}
          disabled={disabled}
          rows={rows}
          aria-invalid={!!error}
          aria-describedby={error ? `${textareaId}-error` : undefined}
          {...props}
          onChange={(e) => {
            adjustHeight();
            props.onChange?.(e);
          }}
        />
        {error && (
          <span id={`${textareaId}-error`} className={styles.errorMessage}>
            {error}
          </span>
        )}
      </div>
    );
  }
));

Textarea.displayName = 'Textarea';
