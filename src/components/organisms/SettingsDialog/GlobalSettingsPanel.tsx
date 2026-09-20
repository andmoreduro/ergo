import { useCallback, useEffect, useState } from "react";

import { TauriApi } from "../../../api/tauri";
import type { EquationSyntax } from "../../../bindings/EquationSyntax";
import type { TranslationServerStatus } from "../../../bindings/TranslationServerStatus";
import { m } from "../../../paraglide/messages.js";
import {
    useGlobalSettings,
    useSettingsActions,
} from "../../../settings/SettingsProvider";
import { locales } from "../../../paraglide/runtime.js";
import type { Locale } from "../../../paraglide/runtime.js";
import { Checkbox } from "../../atoms/Checkbox/Checkbox";
import { Select } from "../../atoms/Select/Select";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { FormField } from "../../molecules/FormField/FormField";
import styles from "./SettingsDialog.module.css";
import { toOptionalNumber } from "./settingsDialogUtils";

const TRANSLATION_SERVER_STATUS_POLL_MS = 3000;

const translationServerStatusLabel = (
    status: TranslationServerStatus | null,
    customServer: boolean,
) => {
    if (!status) {
        return null;
    }

    if (customServer) {
        return status.ready
            ? m.settings_zotero_translation_server_status_ready()
            : m.settings_zotero_translation_server_status_unreachable();
    }

    if (!status.docker_available) {
        return m.settings_zotero_translation_server_docker_unavailable();
    }

    if (status.ready) {
        return m.settings_zotero_translation_server_status_ready();
    }

    if (status.starting) {
        return m.settings_zotero_translation_server_status_starting();
    }

    return m.settings_zotero_translation_server_status_stopped();
};

const translationServerStatusClassName = (
    status: TranslationServerStatus | null,
    customServer: boolean,
) => {
    if (!status) {
        return styles.settingStatus;
    }

    if (status.ready) {
        return `${styles.settingStatus} ${styles.settingStatusRunning}`;
    }

    const misconfigured = customServer
        ? status.enabled
        : !status.docker_available;
    if (misconfigured) {
        return `${styles.settingStatus} ${styles.settingStatusWarning}`;
    }

    return `${styles.settingStatus} ${styles.settingStatusStopped}`;
};

export const GlobalSettingsPanel = () => {
    const settings = useGlobalSettings();
    const { updateGlobalSettings: onChange } = useSettingsActions();
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
        settings.zotero_translation_server_url,
    ]);

    const zoteroEnabled = settings.zotero_translation_server_enabled ?? false;
    const zoteroServerUrl = settings.zotero_translation_server_url ?? "";
    const zoteroCustomServer = zoteroServerUrl.trim().length > 0;
    const statusLabel = translationServerStatusLabel(
        translationServerStatus,
        zoteroCustomServer,
    );

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
                <FormField label={m.settings_zotero_translation_server_url()}>
                    <TextInput
                        aria-label={m.settings_zotero_translation_server_url()}
                        fullWidth
                        inputMode="url"
                        placeholder="http://localhost:1969"
                        value={zoteroServerUrl}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                zotero_translation_server_url:
                                    event.target.value.trim() || null,
                            })
                        }
                    />
                </FormField>
                <p className={styles.settingHint}>
                    {m.settings_zotero_translation_server_url_hint()}
                </p>
                {statusLabel ? (
                    <p
                        className={translationServerStatusClassName(
                            translationServerStatus,
                            zoteroCustomServer,
                        )}
                    >
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
                <FormField label={m.settings_preview_draft_render_factor()}>
                    <Select
                        aria-label={m.settings_preview_draft_render_factor()}
                        fullWidth
                        value={String(settings.preview_draft_render_factor ?? 1.0)}
                        options={[
                            { value: "1", label: "100% (crisp)" },
                            { value: "0.75", label: "75%" },
                            { value: "0.5", label: "50%" },
                            { value: "0.25", label: "25%" },
                        ]}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                preview_draft_render_factor:
                                    event.target.value === "1"
                                        ? 1.0
                                        : Number.parseFloat(event.target.value),
                            })
                        }
                    />
                </FormField>
                <p className={styles.settingHint}>
                    {m.settings_preview_draft_render_factor_hint()}
                </p>
                <FormField label={m.settings_preview_render_overscan_factor()}>
                    <Select
                        aria-label={m.settings_preview_render_overscan_factor()}
                        fullWidth
                        value={String(
                            settings.preview_render_overscan_factor ?? 0,
                        )}
                        options={[
                            { value: "0", label: "0% (exact)" },
                            { value: "0.25", label: "25%" },
                            { value: "0.5", label: "50%" },
                            { value: "1", label: "100%" },
                        ]}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                preview_render_overscan_factor:
                                    Number.parseFloat(event.target.value),
                            })
                        }
                    />
                </FormField>
                <p className={styles.settingHint}>
                    {m.settings_preview_render_overscan_factor_hint()}
                </p>
                <FormField label={m.settings_preview_rasterization_debounce_ms()}>
                    <TextInput
                        aria-label={m.settings_preview_rasterization_debounce_ms()}
                        fullWidth
                        min="0"
                        type="number"
                        value={String(settings.preview_rasterization_debounce_ms ?? 200)}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                preview_rasterization_debounce_ms: toOptionalNumber(
                                    event.target.value,
                                ),
                            })
                        }
                    />
                </FormField>
                <p className={styles.settingHint}>
                    {m.settings_preview_rasterization_debounce_ms_hint()}
                </p>
                <FormField label={m.settings_preview_reveal_debounce_ms()}>
                    <TextInput
                        aria-label={m.settings_preview_reveal_debounce_ms()}
                        fullWidth
                        min="0"
                        type="number"
                        value={String(settings.preview_reveal_debounce_ms ?? 0)}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                preview_reveal_debounce_ms: toOptionalNumber(
                                    event.target.value,
                                ),
                            })
                        }
                    />
                </FormField>
                <p className={styles.settingHint}>
                    {m.settings_preview_reveal_debounce_ms_hint()}
                </p>
                <FormField label={m.settings_preview_forward_sync_debounce_ms()}>
                    <TextInput
                        aria-label={m.settings_preview_forward_sync_debounce_ms()}
                        fullWidth
                        min="0"
                        type="number"
                        value={String(
                            settings.preview_forward_sync_debounce_ms ?? 0,
                        )}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                preview_forward_sync_debounce_ms:
                                    toOptionalNumber(event.target.value),
                            })
                        }
                    />
                </FormField>
                <p className={styles.settingHint}>
                    {m.settings_preview_forward_sync_debounce_ms_hint()}
                </p>
                <FormField label={m.settings_preview_draft_promote_ms()}>
                    <TextInput
                        aria-label={m.settings_preview_draft_promote_ms()}
                        fullWidth
                        min="0"
                        type="number"
                        value={String(settings.preview_draft_promote_ms ?? 180)}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                preview_draft_promote_ms: toOptionalNumber(
                                    event.target.value,
                                ),
                            })
                        }
                    />
                </FormField>
                <p className={styles.settingHint}>
                    {m.settings_preview_draft_promote_ms_hint()}
                </p>
                <div className={styles.fieldCheckbox}>
                    <Checkbox
                        checked={settings.preview_multi_caret ?? true}
                        label={m.settings_preview_multi_caret()}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                preview_multi_caret: event.target.checked,
                            })
                        }
                    />
                </div>
                <p className={styles.settingHint}>
                    {m.settings_preview_multi_caret_hint()}
                </p>
            </div>
        </section>
    </div>
    );
};
