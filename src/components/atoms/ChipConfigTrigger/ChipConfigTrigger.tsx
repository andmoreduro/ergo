import { ButtonHTMLAttributes, forwardRef, memo } from "react";
import { Settings16Regular } from "@fluentui/react-icons";
import styles from "./ChipConfigTrigger.module.css";

export type ChipConfigTriggerProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const ChipConfigTrigger = memo(
    forwardRef<HTMLButtonElement, ChipConfigTriggerProps>(
        ({ className = "", type = "button", ...props }, ref) => (
            <button
                ref={ref}
                type={type}
                className={[styles.button, className].filter(Boolean).join(" ")}
                {...props}
            >
                <Settings16Regular />
            </button>
        ),
    ),
);

ChipConfigTrigger.displayName = "ChipConfigTrigger";
