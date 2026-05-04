import { type ChangeEvent, type FormEvent, useState } from "react";
import { Button } from "../../atoms/Button/Button";
import { Checkbox } from "../../atoms/Checkbox/Checkbox";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { m } from "../../../paraglide/messages.js";
import { projectFileNameFromTitle } from "../../../project/paths";
import styles from "./NewProjectDialog.module.css";

export interface NewProjectDialogValues {
    projectName: string;
    projectFileName: string;
    projectLocation: string;
}

export interface NewProjectDialogProps {
    initialProjectName: string;
    initialProjectLocation: string;
    onCancel: () => void;
    onCreate: (values: NewProjectDialogValues) => void;
    onChooseLocation: () => Promise<string | null>;
}

export const NewProjectDialog = ({
    initialProjectName,
    initialProjectLocation,
    onCancel,
    onCreate,
    onChooseLocation,
}: NewProjectDialogProps) => {
    const [projectName, setProjectName] = useState(initialProjectName);
    const [projectLocation, setProjectLocation] = useState(initialProjectLocation);
    const [projectFileName, setProjectFileName] = useState(
        projectFileNameFromTitle(initialProjectName),
    );
    const [usesDefaultFileName, setUsesDefaultFileName] = useState(true);

    const trimmedProjectName = projectName.trim();
    const trimmedProjectLocation = projectLocation.trim();
    const trimmedProjectFileName = projectFileName.trim();
    const projectNameError = trimmedProjectName
        ? undefined
        : m.project_new_name_required();
    const projectLocationError = trimmedProjectLocation
        ? undefined
        : m.project_new_location_required();
    const projectFileNameError = trimmedProjectFileName
        ? undefined
        : m.project_new_file_name_required();

    const handleProjectNameChange = (event: ChangeEvent<HTMLInputElement>) => {
        const nextProjectName = event.currentTarget.value;
        setProjectName(nextProjectName);

        if (usesDefaultFileName) {
            setProjectFileName(projectFileNameFromTitle(nextProjectName));
        }
    };

    const handleProjectFileNameChange = (event: ChangeEvent<HTMLInputElement>) => {
        setProjectFileName(event.currentTarget.value);
    };

    const handleDefaultFileNameChange = (event: ChangeEvent<HTMLInputElement>) => {
        const shouldUseDefaultFileName = event.currentTarget.checked;
        setUsesDefaultFileName(shouldUseDefaultFileName);

        if (shouldUseDefaultFileName) {
            setProjectFileName(projectFileNameFromTitle(projectName));
        }
    };

    const handleChooseLocation = async () => {
        const selectedLocation = await onChooseLocation();

        if (selectedLocation) {
            setProjectLocation(selectedLocation);
        }
    };

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();

        if (projectNameError || projectLocationError || projectFileNameError) {
            return;
        }

        onCreate({
            projectName: trimmedProjectName,
            projectFileName: trimmedProjectFileName,
            projectLocation: trimmedProjectLocation,
        });
    };

    return (
        <div className={styles.backdrop}>
            <form
                aria-labelledby="new-project-dialog-title"
                aria-modal="true"
                className={styles.dialog}
                role="dialog"
                onSubmit={handleSubmit}
            >
                <header className={styles.header}>
                    <h2 id="new-project-dialog-title">
                        {m.project_new_dialog_title()}
                    </h2>
                </header>

                <div className={styles.content}>
                    <TextInput
                        autoFocus
                        error={projectNameError}
                        fullWidth
                        label={m.project_new_name_label()}
                        value={projectName}
                        onChange={handleProjectNameChange}
                    />
                    <div className={styles.locationRow}>
                        <TextInput
                            error={projectLocationError}
                            fullWidth
                            label={m.project_new_location_label()}
                            readOnly
                            value={projectLocation}
                        />
                        <Button
                            className={styles.folderButton}
                            type="button"
                            variant="secondary"
                            onClick={() => void handleChooseLocation()}
                        >
                            {m.project_new_choose_folder()}
                        </Button>
                    </div>
                    <div className={styles.fileNameGroup}>
                        <TextInput
                            disabled={usesDefaultFileName}
                            error={projectFileNameError}
                            fullWidth
                            label={m.project_new_file_name_label()}
                            value={projectFileName}
                            onChange={handleProjectFileNameChange}
                        />
                        <Checkbox
                            checked={usesDefaultFileName}
                            label={m.project_new_default_file_name()}
                            onChange={handleDefaultFileNameChange}
                        />
                    </div>
                </div>

                <footer className={styles.actions}>
                    <Button type="button" variant="secondary" onClick={onCancel}>
                        {m.project_new_cancel()}
                    </Button>
                    <Button
                        disabled={
                            !!projectNameError ||
                            !!projectLocationError ||
                            !!projectFileNameError
                        }
                        type="submit"
                    >
                        {m.project_new_create()}
                    </Button>
                </footer>
            </form>
        </div>
    );
};
