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
}: {
    title: string;
    children: ReactNode;
    cancelAction: DialogActionButton;
    confirmAction: DialogActionButton;
}) => {
    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        confirmAction.onClick?.();
    };

    return (
        <Dialog
            as="form"
            size="lg"
            title={title}
            titleId="resource-dialog-title"
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
