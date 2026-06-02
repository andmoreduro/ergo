import type { ProjectSettings } from "../../../bindings/ProjectSettings";
import type { TemplateVariantSpec } from "../../../bindings/TemplateVariantSpec";
import { m } from "../../../paraglide/messages.js";
import {
    DOCUMENT_LOCALES,
    normalizeDocumentLanguage,
    type DocumentLocale,
} from "../../../settings/documentLanguage";
import {
    defaultOutlineTitle,
    type OutlineTitleKind,
} from "../../../settings/outlineDefaults";
import {
    getOutlineInclude,
    getTemplateOverride,
    OUTLINE_INCLUDE_OVERRIDE_KEYS,
    OUTLINE_TITLE_OVERRIDE_KEYS,
    setOutlineInclude,
    setTemplateOverride,
    type OutlineIncludeOverrideKey,
    type OutlineTitleOverrideKey,
} from "../../../settings/templateOverrides";
import { Checkbox } from "../../atoms/Checkbox/Checkbox";
import { Select } from "../../atoms/Select/Select";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { FormField } from "../../molecules/FormField/FormField";
import styles from "./SettingsDialog.module.css";
import { toOptionalNumber } from "./settingsDialogUtils";

import type { TemplateOverride } from "../../../bindings/TemplateOverride";

export interface ProjectSettingsPanelProps {
    settings: ProjectSettings;
    onChange: (settings: ProjectSettings) => void;
    templateDefaultOverrides?: TemplateOverride[];
    templateVariants?: TemplateVariantSpec[];
    templateVariantId?: string | null;
    onTemplateVariantChange?: (variantId: string) => void;
}

const outlineSetting = (
    settings: ProjectSettings,
    onChange: (settings: ProjectSettings) => void,
    templateDefaultOverrides: TemplateOverride[],
    includeLabel: string,
    titleLabel: string,
    titleKind: OutlineTitleKind,
    includeKey: OutlineIncludeOverrideKey,
    titleKey: OutlineTitleOverrideKey,
) => {
    const included = getOutlineInclude(settings, includeKey, templateDefaultOverrides);

    return (
        <div className={styles.outlineSetting}>
            <Checkbox
                checked={included}
                label={includeLabel}
                onChange={(event) =>
                    onChange(
                        setOutlineInclude(settings, includeKey, event.currentTarget.checked),
                    )
                }
            />
            {included ? (
                <FormField label={titleLabel}>
                    <TextInput
                        aria-label={titleLabel}
                        fullWidth
                        placeholder={defaultOutlineTitle(
                            settings.language,
                            titleKind,
                        )}
                        value={getTemplateOverride(settings, titleKey)}
                        onChange={(event) =>
                            onChange(setTemplateOverride(settings, titleKey, event.target.value))
                        }
                    />
                </FormField>
            ) : null}
        </div>
    );
};

export const ProjectSettingsPanel = ({
    settings,
    onChange,
    templateDefaultOverrides = [],
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
                {outlineSetting(
                    settings,
                    onChange,
                    templateDefaultOverrides,
                    m.settings_outline_include_contents(),
                    m.settings_outline_contents_title(),
                    "contents",
                    OUTLINE_INCLUDE_OVERRIDE_KEYS.contents,
                    OUTLINE_TITLE_OVERRIDE_KEYS.contents,
                )}
                {outlineSetting(
                    settings,
                    onChange,
                    templateDefaultOverrides,
                    m.settings_outline_include_tables(),
                    m.settings_outline_tables_title(),
                    "tables",
                    OUTLINE_INCLUDE_OVERRIDE_KEYS.tables,
                    OUTLINE_TITLE_OVERRIDE_KEYS.tables,
                )}
                {outlineSetting(
                    settings,
                    onChange,
                    templateDefaultOverrides,
                    m.settings_outline_include_figures(),
                    m.settings_outline_figures_title(),
                    "figures",
                    OUTLINE_INCLUDE_OVERRIDE_KEYS.figures,
                    OUTLINE_TITLE_OVERRIDE_KEYS.figures,
                )}
                {outlineSetting(
                    settings,
                    onChange,
                    templateDefaultOverrides,
                    m.settings_outline_include_equations(),
                    m.settings_outline_equations_title(),
                    "equations",
                    OUTLINE_INCLUDE_OVERRIDE_KEYS.equations,
                    OUTLINE_TITLE_OVERRIDE_KEYS.equations,
                )}
                {outlineSetting(
                    settings,
                    onChange,
                    templateDefaultOverrides,
                    m.settings_outline_include_listings(),
                    m.settings_outline_listings_title(),
                    "listings",
                    OUTLINE_INCLUDE_OVERRIDE_KEYS.listings,
                    OUTLINE_TITLE_OVERRIDE_KEYS.listings,
                )}
                {outlineSetting(
                    settings,
                    onChange,
                    templateDefaultOverrides,
                    m.settings_outline_include_appendices(),
                    m.settings_outline_appendices_title(),
                    "appendices",
                    OUTLINE_INCLUDE_OVERRIDE_KEYS.appendices,
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
                    <Select
                        aria-label={m.settings_project_language()}
                        fullWidth
                        value={normalizeDocumentLanguage(settings.language)}
                        options={DOCUMENT_LOCALES.map((locale) => ({
                            value: locale,
                            label:
                                locale === "es"
                                    ? m.menubar_language_spanish()
                                    : m.menubar_language_english(),
                        }))}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                language: event.target.value as DocumentLocale,
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
