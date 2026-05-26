import styles from "./EditorAddButton.module.css";

const PlusIcon = () => (
    <svg
        aria-hidden="true"
        fill="none"
        height="14"
        viewBox="0 0 14 14"
        width="14"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M7 1v12M1 7h12"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
        />
    </svg>
);

export interface EditorAddButtonProps {
    ariaLabel: string;
    className?: string;
    onClick: () => void;
}

export const EditorAddButton = ({
    ariaLabel,
    className,
    onClick,
}: EditorAddButtonProps) => (
    <button
        aria-label={ariaLabel}
        className={className ? `${styles.button} ${className}` : styles.button}
        type="button"
        onClick={onClick}
    >
        <PlusIcon />
    </button>
);
