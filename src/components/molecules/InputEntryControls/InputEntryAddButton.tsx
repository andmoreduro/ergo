import { Button } from "../../atoms/Button/Button";
import { m } from "../../../paraglide/messages.js";

export interface InputEntryAddButtonProps {
    label: string;
    onClick: () => void;
}

export const InputEntryAddButton = ({ label, onClick }: InputEntryAddButtonProps) => (
    <Button type="button" variant="secondary" size="small" onClick={onClick}>
        {m.editor_add_item({ label })}
    </Button>
);
