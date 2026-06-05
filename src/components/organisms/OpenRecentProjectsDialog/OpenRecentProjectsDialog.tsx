import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { TwoLineListPickerItem } from "../../molecules/TwoLineListPickerItem/TwoLineListPickerItem";
import { Dialog } from "../../molecules/Dialog/Dialog";
import { moveReferenceHighlight } from "../InsertReferenceDialog/insertReferenceListKeyboard";
import { twoLineLabelsForProjectPath } from "../../../project/paths";
import { m } from "../../../paraglide/messages.js";import styles from "./OpenRecentProjectsDialog.module.css";

export interface OpenRecentProjectsDialogProps {
    recentProjects: string[];
    onClose: () => void;
    onOpenProject: (path: string) => void;
}

export const OpenRecentProjectsDialog = ({
    recentProjects,
    onClose,
    onOpenProject,
}: OpenRecentProjectsDialogProps) => {
    const titleId = useId();
    const listboxId = useId();
    const listRef = useRef<HTMLUListElement>(null);
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    useEffect(() => {
        setHighlightedIndex(0);
    }, [recentProjects]);

    useEffect(() => {
        if (recentProjects.length > 0) {
            listRef.current?.focus();
        }
    }, [recentProjects.length]);

    useEffect(() => {
        if (recentProjects.length === 0) {
            return;
        }
        const option = document.getElementById(
            `${listboxId}-option-${highlightedIndex}`,
        );
        option?.scrollIntoView({ block: "nearest" });
    }, [highlightedIndex, listboxId, recentProjects.length]);

    const pickHighlighted = () => {
        const path = recentProjects[highlightedIndex];
        if (path) {
            onOpenProject(path);
            onClose();
        }
    };

    const handleListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
        if (recentProjects.length === 0) {
            return;
        }

        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                setHighlightedIndex((current) =>
                    moveReferenceHighlight(current, 1, recentProjects.length),
                );
                break;
            case "ArrowUp":
                event.preventDefault();
                setHighlightedIndex((current) =>
                    moveReferenceHighlight(current, -1, recentProjects.length),
                );
                break;
            case "Tab":
                event.preventDefault();
                setHighlightedIndex((current) =>
                    moveReferenceHighlight(
                        current,
                        event.shiftKey ? -1 : 1,
                        recentProjects.length,
                    ),
                );
                break;
            case "Enter":
                event.preventDefault();
                event.stopPropagation();
                pickHighlighted();
                break;
            default:
                break;
        }
    };

    const activeOptionId =
        recentProjects.length > 0
            ? `${listboxId}-option-${highlightedIndex}`
            : undefined;

    return (
        <Dialog
            title={m.menubar_open_recent()}
            titleId={titleId}
            size="md"
            cancelAction={{
                label: m.project_new_cancel(),
                onClick: onClose,
            }}
            onBackdropClick={onClose}
        >
            {recentProjects.length > 0 ? (
                <ul
                    ref={listRef}
                    id={listboxId}
                    className={styles.list}
                    role="listbox"
                    aria-labelledby={titleId}
                    aria-activedescendant={activeOptionId}
                    tabIndex={0}
                    onKeyDown={handleListKeyDown}
                >
                    {recentProjects.map((path, index) => {
                        const labels = twoLineLabelsForProjectPath(path);
                        return (
                        <li
                            key={path}
                            id={`${listboxId}-option-${index}`}
                            role="option"
                            aria-selected={index === highlightedIndex}
                            className={
                                index === highlightedIndex
                                    ? styles.listItemHighlighted
                                    : undefined
                            }
                        >
                            <TwoLineListPickerItem
                                primary={labels.primary}
                                secondary={labels.secondary}
                                title={labels.title}
                                onSelect={() => {
                                    onOpenProject(path);
                                    onClose();
                                }}
                            />
                        </li>
                        );
                    })}                </ul>
            ) : (
                <p className={styles.empty}>{m.welcome_no_recent_projects()}</p>
            )}
        </Dialog>
    );
};
