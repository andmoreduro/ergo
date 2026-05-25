import type { ProjectSettings } from "../../../bindings/ProjectSettings";
import type { TemplateVariantSpec } from "../../../bindings/TemplateVariantSpec";
import { m } from "../../../paraglide/messages.js";
import styles from "./SettingsDialog.module.css";
import { toOptionalNumber } from "./settingsDialogUtils";

export interface ProjectSettingsPanelProps {
    settings: ProjectSettings;
    onChange: (settings: ProjectSettings) => void;
    templateVariants?: TemplateVariantSpec[];
    templateVariantId?: string | null;
    onTemplateVariantChange?: (variantId: string) => void;
}

export const ProjectSettingsPanel = ({
    settings,
    onChange,
    templateVariants = [],
    templateVariantId = null,
    onTemplateVariantChange,
}: ProjectSettingsPanelProps) => (
    <div className={styles.fieldGrid}>
        {templateVariants.length > 1 && onTemplateVariantChange && (
            <label className={styles.field}>
                <span>{m.settings_template_variant()}</span>
                <select
                    value={templateVariantId ?? templateVariants[0]?.id ?? ""}
                    onChange={(event) => onTemplateVariantChange(event.target.value)}
                >
                    {templateVariants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                            {variant.label}
                        </option>
                    ))}
                </select>
            </label>
        )}
        <label className={styles.field}>
            <span>{m.settings_paper_size()}</span>
            <input
                value={settings.paper_size ?? ""}
                onChange={(event) =>
                    onChange({
                        ...settings,
                        paper_size: event.target.value.trim() || null,
                    })
                }
            />
        </label>
        <label className={styles.field}>
            <span>{m.settings_project_language()}</span>
            <input
                value={settings.language ?? ""}
                onChange={(event) =>
                    onChange({
                        ...settings,
                        language: event.target.value.trim() || null,
                    })
                }
            />
        </label>
        <label className={styles.field}>
            <span>{m.settings_text_font()}</span>
            <input
                value={settings.text_font ?? ""}
                onChange={(event) =>
                    onChange({
                        ...settings,
                        text_font: event.target.value.trim() || null,
                    })
                }
            />
        </label>
        <label className={styles.field}>
            <span>{m.settings_font_size()}</span>
            <input
                min="1"
                type="number"
                value={settings.font_size ?? 11}
                onChange={(event) =>
                    onChange({
                        ...settings,
                        font_size: toOptionalNumber(event.target.value),
                    })
                }
            />
        </label>
    </div>
);
