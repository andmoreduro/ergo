import type { FormEvent, ReactNode } from "react";
import {
    Dialog,
    type DialogActionButton,
} from "../../molecules/Dialog/Dialog";

export const SidebarResourceDialog = ({
    title,
    children,
    cancelAction,
    confirmAction,
    headerAction,
}: {
    title: string;
    children: ReactNode;
    cancelAction: DialogActionButton;
    confirmAction: DialogActionButton;
    headerAction?: ReactNode;
}) => {    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        confirmAction.onClick?.();
    };

    return (
        <Dialog
            as="form"
            size="lg"
            title={title}
            titleId="resource-dialog-title"
            headerAction={headerAction}
            cancelAction={cancelAction}
            confirmAction={{
                ...confirmAction,
                type: "submit",
            }}
            panelProps={{ onSubmit: submit }}
        >
            {children}
        </Dialog>
    );
};
