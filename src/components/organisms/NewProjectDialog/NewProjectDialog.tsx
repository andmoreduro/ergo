import { type ChangeEvent, type FormEvent, useState } from "react";
import { Button } from "../../atoms/Button/Button";
import { Checkbox } from "../../atoms/Checkbox/Checkbox";
import { Select } from "../../atoms/Select/Select";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { m } from "../../../paraglide/messages.js";
import {
    ERGOPROJ_FILE_EXTENSION,
    projectFileBasenameFromTitle,
    sanitizeProjectFileName,
    stripErgprojExtension,
} from "../../../project/paths";
import {
    DEFAULT_PROJECT_TEMPLATE_ID,
    UMB_APA_TEMPLATE_ID,
    NO_TEMPLATE_ID,
} from "../../../state/ast/defaults";
import { Dialog } from "../../molecules/Dialog/Dialog";
import styles from "./NewProjectDialog.module.css";

export interface NewProjectDialogValues {
    projectName: string;
    projectFileName: string;
    projectLocation: string;
    templateId: string;
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
    const [projectFileBasename, setProjectFileBasename] = useState(
        projectFileBasenameFromTitle(initialProjectName),
    );
    const [usesDefaultFileName, setUsesDefaultFileName] = useState(true);
    const [templateId, setTemplateId] = useState(DEFAULT_PROJECT_TEMPLATE_ID);

    const trimmedProjectName = projectName.trim();
    const trimmedProjectLocation = projectLocation.trim();
    const trimmedProjectFileBasename = projectFileBasename.trim();
    const projectNameError = trimmedProjectName
        ? undefined
        : m.project_new_name_required();
    const projectLocationError = trimmedProjectLocation
        ? undefined
        : m.project_new_location_required();
    const projectFileNameError = trimmedProjectFileBasename
        ? undefined
        : m.project_new_file_name_required();

    const handleProjectNameChange = (event: ChangeEvent<HTMLInputElement>) => {
        const nextProjectName = event.currentTarget.value;
        setProjectName(nextProjectName);

        if (usesDefaultFileName) {
            setProjectFileBasename(projectFileBasenameFromTitle(nextProjectName));
        }
    };

    const handleProjectFileBasenameChange = (event: ChangeEvent<HTMLInputElement>) => {
        setProjectFileBasename(stripErgprojExtension(event.currentTarget.value));
    };

    const handleDefaultFileNameChange = (event: ChangeEvent<HTMLInputElement>) => {
        const shouldUseDefaultFileName = event.currentTarget.checked;
        setUsesDefaultFileName(shouldUseDefaultFileName);

        if (shouldUseDefaultFileName) {
            setProjectFileBasename(projectFileBasenameFromTitle(projectName));
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
            projectFileName: sanitizeProjectFileName(trimmedProjectFileBasename),
            projectLocation: trimmedProjectLocation,
            templateId,
        });
    };

    return (
        <Dialog
            as="form"
            panelProps={{ onSubmit: handleSubmit }}
            size="md"
            title={m.project_new_dialog_title()}
            titleId="new-project-dialog-title"
            cancelAction={{
                label: m.project_new_cancel(),
                onClick: onCancel,
            }}
            confirmAction={{
                label: m.project_new_create(),
                type: "submit",
                disabled:
                    !!projectNameError ||
                    !!projectLocationError ||
                    !!projectFileNameError,
            }}
        >
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
                    <Select
                        fullWidth
                        label={m.project_new_template_label()}
                        options={[
                            {
                                value: DEFAULT_PROJECT_TEMPLATE_ID,
                                label: m.project_new_template_apa(),
                            },
                            {
                                value: UMB_APA_TEMPLATE_ID,
                                label: m.project_new_template_umb(),
                            },
                            {
                                value: NO_TEMPLATE_ID,
                                label: m.project_new_template_none(),
                            },
                        ]}
                        value={templateId}
                        onChange={(event) => setTemplateId(event.target.value)}
                    />
                    <div className={styles.fileNameGroup}>
                        <TextInput
                            disabled={usesDefaultFileName}
                            error={projectFileNameError}
                            fullWidth
                            label={m.project_new_file_name_label()}
                            suffix={ERGOPROJ_FILE_EXTENSION}
                            suffixAriaLabel={m.project_new_file_extension_hint()}
                            value={projectFileBasename}
                            onChange={handleProjectFileBasenameChange}
                        />
                        <Checkbox
                            checked={usesDefaultFileName}
                            label={m.project_new_default_file_name()}
                            onChange={handleDefaultFileNameChange}
                        />
                    </div>
        </Dialog>
    );
};
