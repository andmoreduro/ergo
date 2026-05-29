import type { ProjectSettings } from "../../../bindings/ProjectSettings";
import type { TemplateVariantSpec } from "../../../bindings/TemplateVariantSpec";
import { m } from "../../../paraglide/messages.js";
import {
    getTemplateOverride,
    OUTLINE_TITLE_OVERRIDE_KEYS,
    setTemplateOverride,
} from "../../../settings/templateOverrides";
import { Select } from "../../atoms/Select/Select";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { FormField } from "../../molecules/FormField/FormField";
import styles from "./SettingsDialog.module.css";
import { toOptionalNumber } from "./settingsDialogUtils";

export interface ProjectSettingsPanelProps {
    settings: ProjectSettings;
    onChange: (settings: ProjectSettings) => void;
    templateVariants?: TemplateVariantSpec[];
    templateVariantId?: string | null;
    onTemplateVariantChange?: (variantId: string) => void;
}

const outlineField = (
    settings: ProjectSettings,
    onChange: (settings: ProjectSettings) => void,
    label: string,
    key: (typeof OUTLINE_TITLE_OVERRIDE_KEYS)[keyof typeof OUTLINE_TITLE_OVERRIDE_KEYS],
) => (
    <FormField label={label}>
        <TextInput
            aria-label={label}
            fullWidth
            placeholder={m.settings_outline_title_placeholder()}
            value={getTemplateOverride(settings, key)}
            onChange={(event) =>
                onChange(setTemplateOverride(settings, key, event.target.value))
            }
        />
    </FormField>
);

export const ProjectSettingsPanel = ({
    settings,
    onChange,
    templateVariants = [],
    templateVariantId = null,
    onTemplateVariantChange,
}: ProjectSettingsPanelProps) => (
    <div className={styles.settingsList}>
        <section className={styles.settingsGroup}>
            <h3>{m.settings_group_template()}</h3>
            <div className={styles.fieldGrid}>
                {templateVariants.length > 1 && onTemplateVariantChange ? (
                    <FormField label={m.settings_template_variant()}>
                        <Select
                            aria-label={m.settings_template_variant()}
                            fullWidth
                            value={templateVariantId ?? templateVariants[0]?.id ?? ""}
                            options={templateVariants.map((variant) => ({
                                value: variant.id,
                                label: variant.label,
                            }))}
                            onChange={(event) =>
                                onTemplateVariantChange(event.target.value)
                            }
                        />
                    </FormField>
                ) : null}
                {outlineField(
                    settings,
                    onChange,
                    m.settings_outline_contents_title(),
                    OUTLINE_TITLE_OVERRIDE_KEYS.contents,
                )}
                {outlineField(
                    settings,
                    onChange,
                    m.settings_outline_tables_title(),
                    OUTLINE_TITLE_OVERRIDE_KEYS.tables,
                )}
                {outlineField(
                    settings,
                    onChange,
                    m.settings_outline_figures_title(),
                    OUTLINE_TITLE_OVERRIDE_KEYS.figures,
                )}
                {outlineField(
                    settings,
                    onChange,
                    m.settings_outline_equations_title(),
                    OUTLINE_TITLE_OVERRIDE_KEYS.equations,
                )}
                {outlineField(
                    settings,
                    onChange,
                    m.settings_outline_listings_title(),
                    OUTLINE_TITLE_OVERRIDE_KEYS.listings,
                )}
                {outlineField(
                    settings,
                    onChange,
                    m.settings_outline_appendices_title(),
                    OUTLINE_TITLE_OVERRIDE_KEYS.appendices,
                )}
            </div>
        </section>
        <section className={styles.settingsGroup}>
            <h3>{m.settings_group_document()}</h3>
            <div className={styles.fieldGrid}>
                <FormField label={m.settings_paper_size()}>
                    <TextInput
                        aria-label={m.settings_paper_size()}
                        fullWidth
                        value={settings.paper_size ?? ""}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                paper_size: event.target.value.trim() || null,
                            })
                        }
                    />
                </FormField>
                <FormField label={m.settings_project_language()}>
                    <TextInput
                        aria-label={m.settings_project_language()}
                        fullWidth
                        value={settings.language ?? ""}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                language: event.target.value.trim() || null,
                            })
                        }
                    />
                </FormField>
            </div>
        </section>
        <section className={styles.settingsGroup}>
            <h3>{m.settings_group_typography()}</h3>
            <div className={styles.fieldGrid}>
                <FormField label={m.settings_text_font()}>
                    <TextInput
                        aria-label={m.settings_text_font()}
                        fullWidth
                        value={settings.text_font ?? ""}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                text_font: event.target.value.trim() || null,
                            })
                        }
                    />
                </FormField>
                <FormField label={m.settings_font_size()}>
                    <TextInput
                        aria-label={m.settings_font_size()}
                        fullWidth
                        min="1"
                        type="number"
                        value={String(settings.font_size ?? 11)}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                font_size: toOptionalNumber(event.target.value),
                            })
                        }
                    />
                </FormField>
            </div>
        </section>
        <section className={styles.settingsGroup}>
            <h3>{m.settings_group_advanced()}</h3>
            <div className={styles.fieldGrid} />
        </section>
    </div>
);
