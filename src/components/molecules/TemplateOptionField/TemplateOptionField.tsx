import type { TemplateOptionSpec } from "../../../bindings/TemplateOptionSpec";
import type { ProjectSettings } from "../../../bindings/ProjectSettings";
import {
    choiceLabelForValue,
    choiceValueForLabel,
    getTemplateOptionValue,
    isTemplateOptionEnabled,
    setTemplateOptionValue,
    TEMPLATE_OPTION_COMBOBOX_THRESHOLD,
} from "../../../settings/templateOptions";
import { Checkbox } from "../../atoms/Checkbox/Checkbox";
import { Combobox } from "../../atoms/Combobox/Combobox";
import { Select } from "../../atoms/Select/Select";
import { FormField } from "../FormField/FormField";
import styles from "./TemplateOptionField.module.css";

const choiceDescription = (
    spec: TemplateOptionSpec,
    value: string,
    t: (label: string) => string,
): string | null => {
    const choice = spec.choices.find((entry) => entry.value === value);
    if (!choice?.description) {
        return null;
    }
    return t(choice.description);
};

export interface TemplateOptionFieldProps {
    spec: TemplateOptionSpec;
    settings: ProjectSettings;
    onChange: (settings: ProjectSettings) => void;
    t?: (label: string) => string;
}

export const TemplateOptionField = ({
    spec,
    settings,
    onChange,
    t = (label) => label,
}: TemplateOptionFieldProps) => {
    const label = t(spec.label);

    if (spec.kind === "boolean") {
        return (
            <Checkbox
                checked={isTemplateOptionEnabled(settings, spec)}
                label={label}
                onChange={(event) =>
                    onChange(
                        setTemplateOptionValue(
                            settings,
                            spec.id,
                            event.currentTarget.checked ? "true" : "false",
                        ),
                    )
                }
            />
        );
    }

    const value = getTemplateOptionValue(settings, spec);
    const options = spec.choices.map((choice) => ({
        value: choice.value,
        label: t(choice.label),
    }));
    const optionHint =
        spec.description != null && spec.description !== ""
            ? t(spec.description)
            : null;
    const selectedHint = choiceDescription(spec, value, t);

    const choiceControl =
        options.length >= TEMPLATE_OPTION_COMBOBOX_THRESHOLD ? (
            <Combobox
                aria-label={label}
                fullWidth
                options={options.map((option) => option.label)}
                value={choiceLabelForValue(spec, value, t)}
                onChange={(nextLabel) => {
                    const nextValue = choiceValueForLabel(spec, nextLabel, t);
                    if (nextValue) {
                        onChange(setTemplateOptionValue(settings, spec.id, nextValue));
                    }
                }}
            />
        ) : (
            <Select
                aria-label={label}
                fullWidth
                value={value}
                options={options}
                onChange={(event) =>
                    onChange(
                        setTemplateOptionValue(settings, spec.id, event.target.value),
                    )
                }
            />
        );

    return (
        <div className={styles.stack}>
            <FormField label={label}>{choiceControl}</FormField>
            {selectedHint ? <p className={styles.hint}>{selectedHint}</p> : null}
            {!selectedHint && optionHint ? (
                <p className={styles.hint}>{optionHint}</p>
            ) : null}
        </div>
    );
};
