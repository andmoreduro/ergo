import {
    cloneElement,
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type MutableRefObject,
    type ReactElement,
    type ReactNode,
    type Ref,
    type RefCallback,
} from "react";
import { createPortal } from "react-dom";
import { MenuPanel } from "../MenuPanel/MenuPanel";
import styles from "./DropdownMenu.module.css";

export type DropdownMenuAlign = "start" | "end" | "center";

export interface DropdownMenuProps {
    align?: DropdownMenuAlign;
    menuLabel?: string;
    menuId?: string;
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger: ReactElement;
    children: ReactNode;
}

const MENU_GAP_PX = 4;

const mergeRefs = <T,>(...refs: Array<Ref<T> | undefined>): RefCallback<T> => {
    return (value) => {
        for (const ref of refs) {
            if (!ref) {
                continue;
            }
            if (typeof ref === "function") {
                ref(value);
            } else {
                (ref as MutableRefObject<T | null>).current = value;
            }
        }
    };
};

export const DropdownMenu = ({
    align = "start",
    menuLabel,
    menuId: menuIdProp,
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
    const triggerRef = useRef<HTMLElement | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const generatedMenuId = useId();
    const menuId = menuIdProp ?? generatedMenuId;
    const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

    const updateMenuPosition = useCallback(() => {
        const triggerEl = triggerRef.current;
        if (!triggerEl) {
            return;
        }

        const rect = triggerEl.getBoundingClientRect();
        const top = rect.bottom + MENU_GAP_PX;
        let left = rect.left;
        let transform: string | undefined;

        if (align === "end") {
            left = rect.right;
            transform = "translateX(-100%)";
        } else if (align === "center") {
            left = rect.left + rect.width / 2;
            transform = "translateX(-50%)";
        }

        setMenuStyle({
            position: "fixed",
            top,
            left,
            transform,
            zIndex: 1000,
        });
    }, [align]);

    useLayoutEffect(() => {
        if (!open) {
            return;
        }
        updateMenuPosition();
        window.addEventListener("resize", updateMenuPosition);
        window.addEventListener("scroll", updateMenuPosition, true);
        return () => {
            window.removeEventListener("resize", updateMenuPosition);
            window.removeEventListener("scroll", updateMenuPosition, true);
        };
    }, [open, updateMenuPosition]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (rootRef.current?.contains(target)) {
                return;
            }
            if (menuRef.current?.contains(target)) {
                return;
            }
            setOpen(false);
        };

        window.addEventListener("mousedown", handlePointerDown);
        return () => window.removeEventListener("mousedown", handlePointerDown);
    }, [open, setOpen]);

    const triggerElement = cloneElement(trigger, {
        ref: mergeRefs(
            triggerRef,
            (trigger as ReactElement & { ref?: Ref<HTMLElement> }).ref,
        ),
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

    const menu =
        open ? (
            <MenuPanel
                ref={menuRef}
                aria-label={menuLabel}
                className={styles.menuPanel}
                id={menuId}
                style={menuStyle}
            >
                {children}
            </MenuPanel>
        ) : null;

    return (
        <div className={styles.root} ref={rootRef}>
            {triggerElement}
            {menu ? createPortal(menu, document.body) : null}
        </div>
    );
};
