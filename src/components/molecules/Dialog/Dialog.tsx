import {
    memo,
    type FormHTMLAttributes,
    type HTMLAttributes,
    type ReactNode,
} from "react";
import { Button } from "../../atoms/Button/Button";
import styles from "./Dialog.module.css";

export type DialogSize = "sm" | "md" | "lg" | "xl";

const sizeClass: Record<DialogSize, string> = {
    sm: styles.sizeSm,
    md: styles.sizeMd,
    lg: styles.sizeLg,
    xl: styles.sizeXl,
};

type DialogPanelProps = {
    title?: string;
    titleId: string;
    size?: DialogSize;
    zIndex?: number;
    onClose?: () => void;
    closeLabel?: string;
    closeVariant?: "ghost" | "default";
    headerAction?: ReactNode;
    footer?: ReactNode;
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
        zIndex = 2100,
        onClose,
        closeLabel,
        closeVariant = "default",
        headerAction,
        footer,
        onBackdropClick,
        children,
        as = "section",
        panelProps,
    } = props;

    const panelClassName = [styles.panel, sizeClass[size]].join(" ");

    const showHeader = title || onClose || headerAction;
    const header = showHeader ? (
        <header className={styles.header}>
            {title ? <h2 id={titleId}>{title}</h2> : <span className={styles.visuallyHidden} id={titleId} />}
            {headerAction ??
                (onClose && closeLabel ? (
                    <Button
                        type="button"
                        size="small"
                        variant={closeVariant === "ghost" ? "ghost" : "primary"}
                        onClick={onClose}
                    >
                        {closeLabel}
                    </Button>
                ) : null)}
        </header>
    ) : null;

    const body = <div className={styles.body}>{children}</div>;
    const footerNode = footer ? <footer className={styles.footer}>{footer}</footer> : null;

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
            onClick={onBackdropClick}
        >
            <div onClick={(event) => event.stopPropagation()}>{panel}</div>
        </div>
    );
});

Dialog.displayName = "Dialog";
