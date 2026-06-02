import {
    memo,
    useEffect,
    useRef,
    type FormHTMLAttributes,
    type HTMLAttributes,
    type ReactNode,
} from "react";
import { Button } from "../../atoms/Button/Button";
import styles from "./Dialog.module.css";

export type DialogSize = "sm" | "md" | "lg" | "xl";

export type DialogActionButton = {
    label: string;
    /** Omit when `type` is `submit` and the surrounding dialog is a form. */
    onClick?: () => void;
    disabled?: boolean;
    variant?: "primary" | "secondary" | "danger" | "ghost";
    /** When the dialog is rendered as a form, use `submit` for the confirm control. */
    type?: "button" | "submit";
};

const sizeClass: Record<DialogSize, string> = {
    sm: styles.sizeSm,
    md: styles.sizeMd,
    lg: styles.sizeLg,
    xl: styles.sizeXl,
};

const shouldIgnoreDialogEnter = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return true;
    }
    if (target.isContentEditable) {
        return true;
    }
    return false;
};

type DialogPanelProps = {
    title: string;
    titleId: string;
    size?: DialogSize;
    zIndex?: number;
    cancelAction?: DialogActionButton;
    confirmAction?: DialogActionButton;
    onBackdropClick?: () => void;
    children: ReactNode;
};

type DialogAsSection = DialogPanelProps & {
    as?: "section";
    panelProps?: HTMLAttributes<HTMLElement>;
};

type DialogAsForm = DialogPanelProps & {
    as: "form";
    panelProps?: FormHTMLAttributes<HTMLFormElement>;
};

export type DialogProps = DialogAsSection | DialogAsForm;

export const Dialog = memo((props: DialogProps) => {
    const {
        title,
        titleId,
        size = "md",
        zIndex = 3200,
        cancelAction,
        confirmAction,
        onBackdropClick,
        children,
        as = "section",
        panelProps,
    } = props;

    const cancelRef = useRef(cancelAction);
    const confirmRef = useRef(confirmAction);
    cancelRef.current = cancelAction;
    confirmRef.current = confirmAction;

    const dismissViaBackdrop =
        onBackdropClick ?? cancelAction?.onClick ?? confirmAction?.onClick;

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                const cancel = cancelRef.current;
                const confirm = confirmRef.current;
                const handler = cancel?.onClick ?? confirm?.onClick;
                if (!handler) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                handler();
                return;
            }
            if (event.key !== "Enter" || event.defaultPrevented) {
                return;
            }
            if (shouldIgnoreDialogEnter(event.target)) {
                return;
            }
            const confirm = confirmRef.current;
            const cancel = cancelRef.current;
            if (as === "form" && confirm?.type === "submit") {
                return;
            }
            const handler = confirm?.onClick ?? cancel?.onClick;
            if (!handler) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            handler();
            return;
        };
        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
    }, [as]);

    const panelClassName = [styles.panel, sizeClass[size]].join(" ");

    const header = (
        <header className={styles.header}>
            <h2 id={titleId}>{title}</h2>
        </header>
    );

    const body = <div className={styles.body}>{children}</div>;

    const showFooter = Boolean(cancelAction || confirmAction);
    const footerNode = showFooter ? (
        <footer className={styles.footer}>
            {cancelAction ? (
                <Button
                    type="button"
                    size="small"
                    variant={cancelAction.variant ?? "secondary"}
                    disabled={cancelAction.disabled}
                    onClick={cancelAction.onClick}
                >
                    {cancelAction.label}
                </Button>
            ) : null}
            {confirmAction ? (
                <Button
                    type={confirmAction.type ?? "button"}
                    size="small"
                    variant={confirmAction.variant ?? "primary"}
                    disabled={confirmAction.disabled}
                    onClick={
                        confirmAction.type === "submit"
                            ? undefined
                            : confirmAction.onClick
                    }
                >
                    {confirmAction.label}
                </Button>
            ) : null}
        </footer>
    ) : null;

    const panelChildren = (
        <>
            {header}
            {body}
            {footerNode}
        </>
    );

    const panel =
        as === "form" ? (
            <form
                aria-labelledby={titleId}
                aria-modal="true"
                className={panelClassName}
                role="dialog"
                {...(panelProps as FormHTMLAttributes<HTMLFormElement>)}
            >
                {panelChildren}
            </form>
        ) : (
            <section
                aria-labelledby={titleId}
                aria-modal="true"
                className={panelClassName}
                role="dialog"
                {...(panelProps as HTMLAttributes<HTMLElement>)}
            >
                {panelChildren}
            </section>
        );

    return (
        <div
            className={styles.backdrop}
            role="presentation"
            style={{ zIndex }}
            onClick={dismissViaBackdrop}
        >
            <div
                className={styles.backdropShell}
                onClick={(event) => event.stopPropagation()}
            >
                {panel}
            </div>
        </div>
    );
});

Dialog.displayName = "Dialog";
