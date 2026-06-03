import {
    memo,
    useCallback,
    useState,
    type MouseEvent,
    type ReactNode,
} from "react";
import { ChevronDown24Regular } from "@fluentui/react-icons";
import { IconButton } from "../../atoms/IconButton/IconButton";
import { MenuItemButton } from "../../atoms/MenuItemButton/MenuItemButton";
import { DropdownMenu } from "../DropdownMenu/DropdownMenu";
import styles from "./SplitButton.module.css";

/** Keep ProseMirror selection when the primary (icon) control is pressed. */
const keepEditorSelection = (event: MouseEvent) => {
    event.preventDefault();
};

export interface SplitButtonOption {
    value: string;
    label: string;
}

export interface SplitButtonProps {
    disabled?: boolean;
    icon: ReactNode;
    /** Primary (left) control — default action. */
    primaryLabel: string;
    /** Menu opened by the chevron (right). */
    menuLabel: string;
    options: SplitButtonOption[];
    selectedValue: string;
    onPrimaryClick: () => void;
    onOptionSelect: (value: string) => void;
}

/** Split button: primary action + chevron menu (common toolbar pattern). */
export const SplitButton = memo(
    ({
        disabled = false,
        icon,
        primaryLabel,
        menuLabel,
        options,
        selectedValue,
        onPrimaryClick,
        onOptionSelect,
    }: SplitButtonProps) => {
        const [menuOpen, setMenuOpen] = useState(false);

        const pickOption = useCallback(
            (value: string) => {
                setMenuOpen(false);
                onOptionSelect(value);
            },
            [onOptionSelect],
        );

        return (
            <div className={styles.combo}>
                <IconButton
                    className={styles.primary}
                    title={primaryLabel}
                    aria-label={primaryLabel}
                    disabled={disabled}
                    onMouseDown={keepEditorSelection}
                    onClick={onPrimaryClick}
                >
                    {icon}
                </IconButton>
                <span className={styles.divider} aria-hidden />
                <DropdownMenu
                    align="end"
                    open={disabled ? false : menuOpen}
                    onOpenChange={disabled ? undefined : setMenuOpen}
                    menuLabel={menuLabel}
                    trigger={
                        <IconButton
                            className={styles.menuTrigger}
                            title={menuLabel}
                            aria-label={menuLabel}
                            disabled={disabled}
                        >
                            <ChevronDown24Regular />
                        </IconButton>
                    }
                >
                    {options.map((option) => (
                        <MenuItemButton
                            key={option.value}
                            role="menuitem"
                            variant="dropdown"
                            aria-current={
                                option.value === selectedValue
                                    ? "true"
                                    : undefined
                            }
                            onClick={() => pickOption(option.value)}
                        >
                            {option.label}
                        </MenuItemButton>
                    ))}
                </DropdownMenu>
            </div>
        );
    },
);

SplitButton.displayName = "SplitButton";
