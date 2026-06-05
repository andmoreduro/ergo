import { useCallback, useEffect, useState } from "react";

import { TauriApi } from "../../../api/tauri";
import type { EquationSyntax } from "../../../bindings/EquationSyntax";
import type { GlobalSettings } from "../../../bindings/GlobalSettings";
import type { TranslationServerStatus } from "../../../bindings/TranslationServerStatus";
import { m } from "../../../paraglide/messages.js";
import { locales } from "../../../paraglide/runtime.js";
import type { Locale } from "../../../paraglide/runtime.js";
import { Checkbox } from "../../atoms/Checkbox/Checkbox";
import { Select } from "../../atoms/Select/Select";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { FormField } from "../../molecules/FormField/FormField";
import styles from "./SettingsDialog.module.css";
import { toOptionalNumber } from "./settingsDialogUtils";

const TRANSLATION_SERVER_STATUS_POLL_MS = 3000;

const translationServerStatusLabel = (status: TranslationServerStatus | null) => {
    if (!status) {
        return null;
    }

    if (!status.docker_available) {
        return m.settings_zotero_translation_server_docker_unavailable();
    }

    if (status.running) {
        return m.settings_zotero_translation_server_status_running();
    }

    return m.settings_zotero_translation_server_status_stopped();
};

const translationServerStatusClassName = (status: TranslationServerStatus | null) => {
    if (!status) {
        return styles.settingStatus;
    }

    if (!status.docker_available) {
        return `${styles.settingStatus} ${styles.settingStatusWarning}`;
    }

    if (status.running) {
        return `${styles.settingStatus} ${styles.settingStatusRunning}`;
    }

    return `${styles.settingStatus} ${styles.settingStatusStopped}`;
};

export interface GlobalSettingsPanelProps {
    settings: GlobalSettings;
    onChange: (settings: GlobalSettings) => void;
}

export const GlobalSettingsPanel = ({
    settings,
    onChange,
}: GlobalSettingsPanelProps) => {
    const [translationServerStatus, setTranslationServerStatus] =
        useState<TranslationServerStatus | null>(null);

    const refreshTranslationServerStatus = useCallback(async () => {
        try {
            const status = await TauriApi.getTranslationServerStatus();
            setTranslationServerStatus(status);
        } catch {
            setTranslationServerStatus(null);
        }
    }, []);

    useEffect(() => {
        void refreshTranslationServerStatus();
        const intervalId = window.setInterval(() => {
            void refreshTranslationServerStatus();
        }, TRANSLATION_SERVER_STATUS_POLL_MS);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [
        refreshTranslationServerStatus,
        settings.zotero_translation_server_enabled,
    ]);

    const zoteroEnabled = settings.zotero_translation_server_enabled ?? false;
    const statusLabel = translationServerStatusLabel(translationServerStatus);

    return (
    <div className={styles.settingsList}>
        <section className={styles.settingsGroup}>
            <h3>{m.settings_group_appearance()}</h3>
            <div className={styles.fieldGrid}>
                <FormField label={m.settings_theme()}>
                    <Select
                        aria-label={m.settings_theme()}
                        fullWidth
                        value={settings.theme_mode ?? "system"}
                        options={[
                            { value: "system", label: m.menubar_theme_system() },
                            { value: "light", label: m.menubar_theme_light() },
                            { value: "dark", label: m.menubar_theme_dark() },
                        ]}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                theme_mode: event.target.value,
                            })
                        }
                    />
                </FormField>
                <FormField label={m.settings_language()}>
                    <Select
                        aria-label={m.settings_language()}
                        fullWidth
                        value={settings.locale ?? "en"}
                        options={locales.map((locale) => ({
                            value: locale,
                            label:
                                locale === "es"
                                    ? m.menubar_language_spanish()
                                    : m.menubar_language_english(),
                        }))}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                locale: event.target.value as Locale,
                            })
                        }
                    />
                </FormField>
                <FormField label={m.settings_default_font()}>
                    <TextInput
                        aria-label={m.settings_default_font()}
                        fullWidth
                        value={settings.default_font ?? ""}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                default_font: event.target.value.trim() || null,
                            })
                        }
                    />
                </FormField>
            </div>
        </section>
        <section className={styles.settingsGroup}>
            <h3>{m.settings_group_editing()}</h3>
            <div className={styles.fieldGrid}>
                <FormField label={m.settings_default_equation_syntax()}>
                    <Select
                        aria-label={m.settings_default_equation_syntax()}
                        fullWidth
                        value={settings.default_equation_syntax ?? "typst"}
                        options={[
                            {
                                value: "typst",
                                label: m.editor_equation_syntax_typst(),
                            },
                            {
                                value: "latex",
                                label: m.editor_equation_syntax_latex(),
                            },
                        ]}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                default_equation_syntax: event.target
                                    .value as EquationSyntax,
                            })
                        }
                    />
                </FormField>
            </div>
        </section>
        <section className={styles.settingsGroup}>
            <h3>{m.settings_group_saving()}</h3>
            <div className={styles.fieldGrid}>
                <div className={styles.fieldCheckbox}>
                    <Checkbox
                        checked={settings.autosave_enabled ?? true}
                        label={m.settings_autosave_enabled()}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                autosave_enabled: event.target.checked,
                            })
                        }
                    />
                </div>
                <FormField label={m.settings_autosave_interval_ms()}>
                    <TextInput
                        aria-label={m.settings_autosave_interval_ms()}
                        fullWidth
                        min="1000"
                        type="number"
                        disabled={!(settings.autosave_enabled ?? true)}
                        value={String(settings.autosave_interval_ms ?? 30000)}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                autosave_interval_ms: toOptionalNumber(event.target.value),
                            })
                        }
                    />
                </FormField>
                <div className={styles.fieldCheckbox}>
                    <Checkbox
                        checked={settings.autosave_on_window_blur ?? true}
                        label={m.settings_autosave_on_window_blur()}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                autosave_on_window_blur: event.target.checked,
                            })
                        }
                    />
                </div>
                <div className={styles.fieldCheckbox}>
                    <Checkbox
                        checked={settings.autosave_on_app_close ?? true}
                        label={m.settings_autosave_on_app_close()}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                autosave_on_app_close: event.target.checked,
                            })
                        }
                    />
                </div>
                <div className={styles.fieldCheckbox}>
                    <Checkbox
                        checked={settings.autosave_on_project_close ?? true}
                        label={m.settings_autosave_on_project_close()}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                autosave_on_project_close: event.target.checked,
                            })
                        }
                    />
                </div>
            </div>
        </section>
        <section className={styles.settingsGroup}>
            <h3>{m.settings_group_references()}</h3>
            <div className={styles.fieldGrid}>
                <div className={styles.fieldCheckbox}>
                    <Checkbox
                        checked={zoteroEnabled}
                        label={m.settings_zotero_translation_server_enabled()}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                zotero_translation_server_enabled: event.target.checked,
                            })
                        }
                    />
                </div>
                <p className={styles.settingHint}>
                    {m.settings_zotero_translation_server_docker_required()}
                </p>
                {statusLabel ? (
                    <p className={translationServerStatusClassName(translationServerStatus)}>
                        {statusLabel}
                    </p>
                ) : null}
            </div>
        </section>
        <section className={styles.settingsGroup}>
            <h3>{m.settings_group_advanced()}</h3>
            <div className={styles.fieldGrid}>
                <FormField label={m.settings_history_limit()}>
                    <TextInput
                        aria-label={m.settings_history_limit()}
                        fullWidth
                        min="1"
                        type="number"
                        value={String(settings.history_limit ?? 100)}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                history_limit: toOptionalNumber(event.target.value),
                            })
                        }
                    />
                </FormField>
            </div>
        </section>
    </div>
    );
};
