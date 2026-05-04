import { useState } from 'react';
import styles from './Accordion.module.css';

export interface AccordionProps {
  /**
   * The title displayed in the accordion header
   */
  title: string;
  /**
   * The content to display when the accordion is expanded
   */
  children: React.ReactNode;
  /**
   * Whether the accordion is open by default
   * @default false
   */
  defaultOpen?: boolean;
}

export const Accordion = ({
  title,
  children,
  defaultOpen = false,
}: AccordionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const toggleAccordion = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <div className={styles.container}>
      <button
        className={styles.header}
        onClick={toggleAccordion}
        aria-expanded={isOpen}
      >
        <span className={styles.title}>{title}</span>
        <span className={`${styles.icon} ${isOpen ? styles.iconOpen : ''}`}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M6 9L12 15L18 9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {isOpen && <div className={styles.content}>{children}</div>}
    </div>
  );
};
