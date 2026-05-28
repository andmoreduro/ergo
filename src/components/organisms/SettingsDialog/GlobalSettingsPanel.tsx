import type { GlobalSettings } from "../../../bindings/GlobalSettings";
import { m } from "../../../paraglide/messages.js";
import { locales } from "../../../paraglide/runtime.js";
import type { Locale } from "../../../paraglide/runtime.js";
import { Checkbox } from "../../atoms/Checkbox/Checkbox";
import styles from "./SettingsDialog.module.css";
import { toOptionalNumber } from "./settingsDialogUtils";

export interface GlobalSettingsPanelProps {
    settings: GlobalSettings;
    onChange: (settings: GlobalSettings) => void;
}

export const GlobalSettingsPanel = ({
    settings,
    onChange,
}: GlobalSettingsPanelProps) => (
    <div className={styles.settingsList}>
        <section className={styles.settingsGroup}>
            <h3>{m.settings_group_appearance()}</h3>
            <div className={styles.fieldGrid}>
                <label className={styles.field}>
                    <span>{m.settings_theme()}</span>
                    <select
                        aria-label={m.settings_theme()}
                        value={settings.theme_mode ?? "system"}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                theme_mode: event.target.value,
                            })
                        }
                    >
                        <option value="system">{m.menubar_theme_system()}</option>
                        <option value="light">{m.menubar_theme_light()}</option>
                        <option value="dark">{m.menubar_theme_dark()}</option>
                    </select>
                </label>
                <label className={styles.field}>
                    <span>{m.settings_language()}</span>
                    <select
                        value={settings.locale ?? "en"}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                locale: event.target.value as Locale,
                            })
                        }
                    >
                        {locales.map((locale) => (
                            <option value={locale} key={locale}>
                                {locale === "es"
                                    ? m.menubar_language_spanish()
                                    : m.menubar_language_english()}
                            </option>
                        ))}
                    </select>
                </label>
                <label className={styles.field}>
                    <span>{m.settings_default_font()}</span>
                    <input
                        value={settings.default_font ?? ""}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                default_font: event.target.value.trim() || null,
                            })
                        }
                    />
                </label>
            </div>
        </section>
        <section className={styles.settingsGroup}>
            <h3>{m.settings_group_saving()}</h3>
            <div className={styles.fieldGrid}>
                <div className={styles.field}>
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
                <label className={styles.field}>
                    <span>{m.settings_autosave_interval_ms()}</span>
                    <input
                        min="1000"
                        type="number"
                        disabled={!(settings.autosave_enabled ?? true)}
                        value={settings.autosave_interval_ms ?? 30000}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                autosave_interval_ms: toOptionalNumber(event.target.value),
                            })
                        }
                    />
                </label>
                <div className={styles.field}>
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
                <div className={styles.field}>
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
                <div className={styles.field}>
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
            <h3>{m.settings_group_advanced()}</h3>
            <div className={styles.fieldGrid}>
                <label className={styles.field}>
                    <span>{m.settings_history_limit()}</span>
                    <input
                        min="1"
                        type="number"
                        value={settings.history_limit ?? 100}
                        onChange={(event) =>
                            onChange({
                                ...settings,
                                history_limit: toOptionalNumber(event.target.value),
                            })
                        }
                    />
                </label>
            </div>
        </section>
    </div>
);
