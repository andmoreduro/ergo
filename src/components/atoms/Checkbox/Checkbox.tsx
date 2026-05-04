import { InputHTMLAttributes, forwardRef, useId } from 'react';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = '', id, disabled, ...props }, ref) => {
    const defaultId = useId();
    const inputId = id || defaultId;

    return (
      <div className={`${styles.container} ${className}`.trim()}>
        <div className={styles.inputWrapper}>
          <input
            type="checkbox"
            id={inputId}
            ref={ref}
            className={styles.input}
            disabled={disabled}
            {...props}
          />
          <div className={styles.customCheckbox}>
            <svg
              className={styles.checkmark}
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>
        {label && (
          <label
            htmlFor={inputId}
            className={`${styles.label} ${disabled ? styles.disabledLabel : ''}`}
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
