import { Delete24Regular } from "@fluentui/react-icons";
import { IconButton } from "../../atoms/IconButton/IconButton";
import entryStyles from "../../../styles/inputEntry.module.css";
import { m } from "../../../paraglide/messages.js";

export interface InputEntryRemoveButtonProps {
    onClick: () => void;
    ariaLabel?: string;
}

export const InputEntryRemoveButton = ({
    onClick,
    ariaLabel,
}: InputEntryRemoveButtonProps) => {
    const label = ariaLabel ?? m.editor_remove_item();

    return (
        <IconButton
            className={entryStyles.removeButton}
            title={label}
            aria-label={label}
            onClick={onClick}
        >
            <Delete24Regular />
        </IconButton>
    );
};
