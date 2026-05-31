import type { ReactNode } from "react";
import { Dialog } from "../../molecules/Dialog/Dialog";

export const SidebarResourceDialog = ({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) => (
    <Dialog size="lg" title={title} titleId="resource-dialog-title">
        {children}
    </Dialog>
);
