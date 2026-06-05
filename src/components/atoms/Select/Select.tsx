import {
    SelectHTMLAttributes,
    forwardRef,
    useId,
    memo,
    type ChangeEvent,
} from "react";
import { Combobox } from "../Combobox/Combobox";
import { FieldLabel, type FieldImportance } from "../FieldLabel/FieldLabel";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    "onChange"
> {
  /**
   * Optional label for the select
   */
  label?: string;
  importance?: FieldImportance;
  /**
   * Optional error message to display below the select
   */
  error?: string;
  /**
   * If true, the select spans the full width of its container
   * @default false
   */
  fullWidth?: boolean;
  /**
   * Compact styling for inline toolbars (e.g. heading level beside body text).
   * @default "default"
   */
  variant?: "default" | "inline";
  /**
   * Array of options to render inside the select
   */
  options: SelectOption[];
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
}

export const Select = memo(forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      importance,
      error,
      fullWidth = false,
      variant = "default",
      options,
      className = "",
      id,
      disabled,
      value,
      onChange,
      ...props
    },
    ref,
  ) => {
    const defaultId = useId();
    const selectId = id || defaultId;
    const selectedValue = value === undefined || value === null ? "" : String(value);
    const selectedOption = options.find((option) => option.value === selectedValue);

    if (variant === "inline") {
      const containerClassNames = [
        styles.container,
        fullWidth ? styles.fullWidth : "",
        styles.inline,
        className,
      ]
        .filter(Boolean)
        .join(" ");

      const selectClassNames = [
        styles.select,
        error ? styles.selectError : "",
        disabled ? styles.disabled : "",
      ]
        .filter(Boolean)
        .join(" ");

      return (
        <div className={containerClassNames}>
          {label && (
            <FieldLabel htmlFor={selectId} importance={importance}>
              {label}
            </FieldLabel>
          )}
          <div className={styles.selectWrapper}>
            <select
              ref={ref}
              id={selectId}
              className={selectClassNames}
              disabled={disabled}
              value={selectedValue}
              aria-invalid={!!error}
              aria-describedby={error ? `${selectId}-error` : undefined}
              onChange={onChange}
              {...props}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className={styles.chevron} aria-hidden="true">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M3 4.5L6 7.5L9 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          {error && (
            <span id={`${selectId}-error`} className={styles.errorMessage}>
              {error}
            </span>
          )}
        </div>
      );
    }

    const emitChange = (nextValue: string) => {
      if (!onChange) {
        return;
      }
      onChange({
        target: { value: nextValue },
        currentTarget: { value: nextValue },
      } as ChangeEvent<HTMLSelectElement>);
    };

    return (
      <div className={[className].filter(Boolean).join(" ")}>
        <Combobox
          id={selectId}
          label={label}
          importance={importance}
          fullWidth={fullWidth}
          filterable={false}
          error={!!error}
          disabled={disabled}
          aria-label={props["aria-label"]}
          value={selectedOption?.label ?? ""}
          options={options.map((option) => option.label)}
          onChange={(label) => {
            const option = options.find((entry) => entry.label === label);
            if (option) {
              emitChange(option.value);
            }
          }}
        />
        {error && (
          <span id={`${selectId}-error`} className={styles.errorMessage}>
            {error}
          </span>
        )}
      </div>
    );
  },
));

Select.displayName = "Select";
