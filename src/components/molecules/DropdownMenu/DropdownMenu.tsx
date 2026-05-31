import {
    cloneElement,
    useEffect,
    useId,
    useRef,
    useState,
    type ReactElement,
    type ReactNode,
} from "react";
import { MenuPanel } from "../MenuPanel/MenuPanel";
import styles from "./DropdownMenu.module.css";

export type DropdownMenuAlign = "start" | "end" | "center";

export interface DropdownMenuProps {
    align?: DropdownMenuAlign;
    menuLabel?: string;
    menuId?: string;
    scrollable?: boolean;
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger: ReactElement;
    children: ReactNode;
}

const alignClass: Record<DropdownMenuAlign, string> = {
    start: styles.menuStart,
    end: styles.menuEnd,
    center: styles.menuCenter,
};

export const DropdownMenu = ({
    align = "start",
    menuLabel,
    menuId: menuIdProp,
    scrollable = false,
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    trigger,
    children,
}: DropdownMenuProps) => {
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const open = openProp ?? internalOpen;
    const setOpen = onOpenChange ?? setInternalOpen;
    const rootRef = useRef<HTMLDivElement>(null);
    const generatedMenuId = useId();
    const menuId = menuIdProp ?? generatedMenuId;

    useEffect(() => {
        if (!open) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        window.addEventListener("mousedown", handlePointerDown);
        return () => window.removeEventListener("mousedown", handlePointerDown);
    }, [open, setOpen]);

    const menuClassName = [styles.menu, alignClass[align]].join(" ");

    const triggerElement = cloneElement(trigger, {
        "aria-controls": menuId,
        "aria-expanded": open,
        "aria-haspopup": "menu" as const,
        onClick: (event: React.MouseEvent<HTMLElement>) => {
            trigger.props.onClick?.(event);
            if (!event.defaultPrevented) {
                setOpen(!open);
            }
        },
    });

    return (
        <div className={styles.root} ref={rootRef}>
            {triggerElement}
            {open ? (
                <MenuPanel
                    aria-label={menuLabel}
                    className={menuClassName}
                    id={menuId}
                    scrollable={scrollable}
                >
                    {children}
                </MenuPanel>
            ) : null}
        </div>
    );
};
