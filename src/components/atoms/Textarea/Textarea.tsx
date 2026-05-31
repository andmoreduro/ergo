import { TextareaHTMLAttributes, forwardRef, useId, memo, useLayoutEffect, useRef } from 'react';
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
  /**
   * If true, render the textarea in a monospace font (for source/code input).
   * @default false
   */
  monospace?: boolean;
}

export const Textarea = memo(forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      importance,
      error,
      fullWidth = false,
      monospace = false,
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

    useLayoutEffect(() => {
      adjustHeight();
    }, [props.value, props.defaultValue]);

    const containerClassNames = [
      styles.container,
      fullWidth ? styles.fullWidth : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const textareaClassNames = [
      styles.textarea,
      monospace ? styles.monospace : '',
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
