import { useEffect, useState } from "react";
import type { FontAvailability } from "../../../bindings/FontAvailability";
import type { ProjectSettings } from "../../../bindings/ProjectSettings";
import type { ProjectFontAvailability } from "../../../bindings/ProjectFontAvailability";
import type { TemplateOptionSpec } from "../../../bindings/TemplateOptionSpec";
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
import { Combobox } from "../../atoms/Combobox/Combobox";
import { Select } from "../../atoms/Select/Select";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { FormField } from "../../molecules/FormField/FormField";
import { TemplateOptionField } from "../../molecules/TemplateOptionField/TemplateOptionField";
import styles from "./SettingsDialog.module.css";
import {
    checkProjectFontAvailability,
    fontUnavailableMessage,
} from "../../../settings/projectFontNotifications";
import { toOptionalNumber } from "./settingsDialogUtils";

import type { TemplateOverride } from "../../../bindings/TemplateOverride";

const PAPER_SIZES = [
    "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10", "a11",
    "iso-b1", "iso-b2", "iso-b3", "iso-b4", "iso-b5", "iso-b6", "iso-b7", "iso-b8",
    "iso-c3", "iso-c4", "iso-c5", "iso-c6", "iso-c7", "iso-c8",
    "din-d3", "din-d4", "din-d5", "din-d6", "din-d7", "din-d8",
    "sis-g5", "sis-e5",
    "ansi-a", "ansi-b", "ansi-c", "ansi-d", "ansi-e",
    "arch-a", "arch-b", "arch-c", "arch-d", "arch-e1", "arch-e",
    "jis-b0", "jis-b1", "jis-b2", "jis-b3", "jis-b4", "jis-b5", "jis-b6", "jis-b7", "jis-b8", "jis-b9", "jis-b10", "jis-b11",
    "sac-d0", "sac-d1", "sac-d2", "sac-d3", "sac-d4", "sac-d5", "sac-d6",
    "iso-id-1", "iso-id-2", "iso-id-3",
    "asia-f4",
    "jp-shiroku-ban-4", "jp-shiroku-ban-5", "jp-shiroku-ban-6",
    "jp-kiku-4", "jp-kiku-5",
    "jp-business-card", "cn-business-card", "eu-business-card",
    "fr-tellière", "fr-couronne-écriture", "fr-couronne-édition", "fr-raisin", "fr-carré", "fr-jésus",
    "uk-brief", "uk-draft", "uk-foolscap", "uk-quarto", "uk-crown", "uk-book-a", "uk-book-b",
    "us-letter", "us-legal", "us-tabloid", "us-executive", "us-foolscap-folio", "us-statement", "us-ledger", "us-oficio", "us-gov-letter", "us-gov-legal", "us-business-card", "us-digest", "us-trade",
    "newspaper-compact", "newspaper-berliner", "newspaper-broadsheet",
    "presentation-16-9", "presentation-4-3"
];

export interface ProjectSettingsPanelProps {
    settings: ProjectSettings;
    onChange: (settings: ProjectSettings) => void;
    templateDefaultOverrides?: TemplateOverride[];
    templateOptions?: TemplateOptionSpec[];
    templateVariants?: TemplateVariantSpec[];
    templateVariantId?: string | null;
    onTemplateVariantChange?: (variantId: string) => void;
    systemFonts?: string[];
    t?: (key: string) => string;
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

const fontUnavailableNotice = (entry: FontAvailability | undefined) =>
    entry?.requested && !entry.available ? (
        <p className={styles.fontUnavailable} role="alert">
            {fontUnavailableMessage(entry)}
        </p>
    ) : null;

export const ProjectSettingsPanel = ({
    settings,
    onChange,
    templateDefaultOverrides = [],
    templateOptions = [],
    templateVariants = [],
    templateVariantId = null,
    onTemplateVariantChange,
    systemFonts = [],
    t,
}: ProjectSettingsPanelProps) => {
    const [fontAvailability, setFontAvailability] =
        useState<ProjectFontAvailability | null>(null);

    useEffect(() => {
        let cancelled = false;
        void checkProjectFontAvailability(settings).then((availability) => {
            if (!cancelled) {
                setFontAvailability(availability);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [settings.text_font, settings.math_font, settings.raw_font]);

    return (
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
                                label: t ? t(variant.label) : variant.label,
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
                {templateOptions.map((option) => (
                    <TemplateOptionField
                        key={option.id}
                        spec={option}
                        settings={settings}
                        onChange={onChange}
                        t={t}
                    />
                ))}
            </div>
        </section>
        <section className={styles.settingsGroup}>
            <h3>{m.settings_group_document()}</h3>
            <div className={styles.fieldGrid}>
                <FormField label={m.settings_paper_size()}>
                    <Select
                        aria-label={m.settings_paper_size()}
                        fullWidth
                        value={settings.paper_size ?? "us-letter"}
                        options={PAPER_SIZES.map((size) => ({
                            value: size,
                            label: size,
                        }))}
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
                    <Combobox
                        aria-label={m.settings_text_font()}
                        fullWidth
                        options={systemFonts}
                        placeholder={m.settings_font_search_placeholder()}
                        noResultsLabel={m.settings_font_no_results()}
                        value={settings.text_font ?? ""}
                        onChange={(font) =>
                            onChange({
                                ...settings,
                                text_font: font.trim() || null,
                            })
                        }
                    />
                    {fontUnavailableNotice(fontAvailability?.textFont)}
                </FormField>
                <FormField label={m.settings_math_font()}>
                    <Combobox
                        aria-label={m.settings_math_font()}
                        fullWidth
                        options={systemFonts}
                        placeholder={m.settings_font_search_placeholder()}
                        noResultsLabel={m.settings_font_no_results()}
                        value={settings.math_font ?? ""}
                        onChange={(font) =>
                            onChange({
                                ...settings,
                                math_font: font.trim() || null,
                            })
                        }
                    />
                    {fontUnavailableNotice(fontAvailability?.mathFont)}
                </FormField>
                <FormField label={m.settings_monospace_font()}>
                    <Combobox
                        aria-label={m.settings_monospace_font()}
                        fullWidth
                        options={systemFonts}
                        placeholder={m.settings_font_search_placeholder()}
                        noResultsLabel={m.settings_font_no_results()}
                        value={settings.raw_font ?? ""}
                        onChange={(font) =>
                            onChange({
                                ...settings,
                                raw_font: font.trim() || null,
                            })
                        }
                    />
                    {fontUnavailableNotice(fontAvailability?.rawFont)}
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
};
