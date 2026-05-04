import { useState } from "react";
import type { GlobalSettings } from "../../../bindings/GlobalSettings";
import type { KeymapSettings } from "../../../bindings/KeymapSettings";
import type { KeyStroke } from "../../../bindings/KeyStroke";
import type { ProjectSettings } from "../../../bindings/ProjectSettings";
import type { KeyBinding, KeymapProfile } from "../../../commands/types";
import { formatKeySequence } from "../../../settings/keymap";
import { m } from "../../../paraglide/messages.js";
import { Button } from "../../atoms/Button/Button";
import { Checkbox } from "../../atoms/Checkbox/Checkbox";
import styles from "./SettingsDialog.module.css";

export type SettingsPanel = "global" | "project" | "keymap";

export interface SettingsDialogProps {
    panel: SettingsPanel;
    globalSettings: GlobalSettings;
    projectSettings: ProjectSettings;
    keymapSettings: KeymapSettings;
    keymap: KeymapProfile;
    conflicts: unknown[];
    onGlobalSettingsChange: (settings: GlobalSettings) => void;
    onKeymapSettingsChange: (settings: KeymapSettings) => void;
    onProjectSettingsChange: (settings: ProjectSettings) => void;
    onClose: () => void;
}

const toOptionalNumber = (value: string): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const removeKeymapOverride = (
    settings: KeymapSettings,
    binding: KeyBinding,
): KeymapSettings => ({
    ...settings,
    keymap_overrides: settings.keymap_overrides.filter(
        (override) => {
            const legacyScope = (override as { scope?: string }).scope;
            const overrideContext =
                override.context ??
                (legacyScope === "global"
                    ? "app"
                    : legacyScope === "project"
                      ? "workspace && !input"
                      : legacyScope === "editor"
                        ? "editor && !input"
                        : null);

            return (
                override.action_id !== binding.commandId ||
                overrideContext !== binding.context
            );
        },
    ),
});

const upsertKeymapOverride = (
    settings: KeymapSettings,
    binding: KeyBinding,
    sequence: KeyStroke[],
): KeymapSettings => {
    const withoutCurrent = removeKeymapOverride(settings, binding);

    return {
        ...withoutCurrent,
        keymap_overrides: [
            ...withoutCurrent.keymap_overrides,
            {
                action_id: binding.commandId,
                context: binding.context,
                sequence,
            },
        ],
    };
};

const strokeFromKeyboardEvent = (event: React.KeyboardEvent): KeyStroke | null => {
    if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
        return null;
    }

    const modifiers: KeyStroke["modifiers"] = [];
    if (event.ctrlKey) {
        modifiers.push("Control");
    }
    if (event.altKey) {
        modifiers.push("Alt");
    }
    if (event.shiftKey) {
        modifiers.push("Shift");
    }
    if (event.metaKey) {
        modifiers.push("Meta");
    }

    return {
        key: event.key.length === 1 ? event.key.toLocaleLowerCase() : event.key.toLowerCase(),
        modifiers,
    };
};

export const SettingsDialog = ({
    panel,
    globalSettings,
    projectSettings,
    keymapSettings,
    keymap,
    conflicts,
    onGlobalSettingsChange,
    onKeymapSettingsChange,
    onProjectSettingsChange,
    onClose,
}: SettingsDialogProps) => {
    const [recordingBindingKey, setRecordingBindingKey] = useState<string | null>(
        null,
    );
    const [recordingSequence, setRecordingSequence] = useState<KeyStroke[]>([]);
    const title =
        panel === "project"
            ? m.settings_project_title()
            : panel === "keymap"
              ? m.settings_keymap_title()
              : m.settings_global_title();

    return (
        <div className={styles.backdrop}>
            <section
                aria-modal="true"
                aria-labelledby="settings-title"
                className={styles.dialog}
                role="dialog"
            >
                <div className={styles.header}>
                    <h2 id="settings-title">{title}</h2>
                    <Button type="button" size="small" onClick={onClose}>
                        {m.command_palette_close()}
                    </Button>
                </div>
                <div className={styles.content}>
                    {panel === "global" && (
                        <div className={styles.fieldGrid}>
                            <label className={styles.field}>
                                <span>{m.settings_theme()}</span>
                                <select
                                    value={globalSettings.theme_mode ?? "system"}
                                    onChange={(event) =>
                                        onGlobalSettingsChange({
                                            ...globalSettings,
                                            theme_mode: event.target.value,
                                        })
                                    }
                                >
                                    <option value="system">
                                        {m.menubar_theme_system()}
                                    </option>
                                    <option value="light">
                                        {m.menubar_theme_light()}
                                    </option>
                                    <option value="dark">
                                        {m.menubar_theme_dark()}
                                    </option>
                                </select>
                            </label>
                            <label className={styles.field}>
                                <span>{m.settings_history_limit()}</span>
                                <input
                                    min="1"
                                    type="number"
                                    value={globalSettings.history_limit ?? 100}
                                    onChange={(event) =>
                                        onGlobalSettingsChange({
                                            ...globalSettings,
                                            history_limit: toOptionalNumber(
                                                event.target.value,
                                            ),
                                        })
                                    }
                                />
                            </label>
                            <label className={styles.field}>
                                <Checkbox
                                    checked={
                                        globalSettings.preview_debounce_enabled ??
                                        false
                                    }
                                    label={m.settings_preview_debounce_enabled()}
                                    onChange={(event) =>
                                        onGlobalSettingsChange({
                                            ...globalSettings,
                                            preview_debounce_enabled:
                                                event.target.checked,
                                        })
                                    }
                                />
                            </label>
                            <label className={styles.field}>
                                <span>{m.settings_preview_debounce_ms()}</span>
                                <input
                                    min="0"
                                    type="number"
                                    disabled={
                                        !(globalSettings.preview_debounce_enabled ?? false)
                                    }
                                    value={globalSettings.preview_debounce_ms ?? 120}
                                    onChange={(event) =>
                                        onGlobalSettingsChange({
                                            ...globalSettings,
                                            preview_debounce_ms: toOptionalNumber(
                                                event.target.value,
                                            ),
                                        })
                                    }
                                />
                            </label>
                            <label className={styles.field}>
                                <span>{m.settings_default_font()}</span>
                                <input
                                    value={globalSettings.default_font ?? ""}
                                    onChange={(event) =>
                                        onGlobalSettingsChange({
                                            ...globalSettings,
                                            default_font:
                                                event.target.value.trim() || null,
                                        })
                                    }
                                />
                            </label>
                        </div>
                    )}

                    {panel === "project" && (
                        <div className={styles.fieldGrid}>
                            <label className={styles.field}>
                                <span>{m.settings_paper_size()}</span>
                                <input
                                    value={projectSettings.paper_size ?? ""}
                                    onChange={(event) =>
                                        onProjectSettingsChange({
                                            ...projectSettings,
                                            paper_size:
                                                event.target.value.trim() || null,
                                        })
                                    }
                                />
                            </label>
                            <label className={styles.field}>
                                <span>{m.settings_project_language()}</span>
                                <input
                                    value={projectSettings.language ?? ""}
                                    onChange={(event) =>
                                        onProjectSettingsChange({
                                            ...projectSettings,
                                            language:
                                                event.target.value.trim() || null,
                                        })
                                    }
                                />
                            </label>
                            <label className={styles.field}>
                                <span>{m.settings_text_font()}</span>
                                <input
                                    value={projectSettings.text_font ?? ""}
                                    onChange={(event) =>
                                        onProjectSettingsChange({
                                            ...projectSettings,
                                            text_font:
                                                event.target.value.trim() || null,
                                        })
                                    }
                                />
                            </label>
                            <label className={styles.field}>
                                <span>{m.settings_font_size()}</span>
                                <input
                                    min="1"
                                    type="number"
                                    value={projectSettings.font_size ?? 11}
                                    onChange={(event) =>
                                        onProjectSettingsChange({
                                            ...projectSettings,
                                            font_size: toOptionalNumber(
                                                event.target.value,
                                            ),
                                        })
                                    }
                                />
                            </label>
                        </div>
                    )}

                    {panel === "keymap" && (
                        <>
                            <label className={styles.field}>
                                <span>{m.settings_keymap_profile()}</span>
                                <input
                                    value={keymapSettings.keymap_profile ?? "Default"}
                                    onChange={(event) =>
                                        onKeymapSettingsChange({
                                            ...keymapSettings,
                                            keymap_profile:
                                                event.target.value.trim() || "Default",
                                        })
                                    }
                                />
                            </label>
                            <h3 className={styles.sectionTitle}>
                                {m.settings_keymap_bindings()}
                            </h3>
                            {conflicts.length > 0 ? (
                                <p className={styles.warning}>
                                    {m.settings_keymap_conflicts({
                                        count: conflicts.length,
                                    })}
                                </p>
                            ) : (
                                <p className={styles.empty}>
                                    {m.settings_keymap_no_conflicts()}
                                </p>
                            )}
                            <ul className={styles.list}>
                                {keymap.bindings.map((binding) => {
                                    const bindingKey = `${binding.context}-${binding.commandId}`;
                                    const isRecording =
                                        recordingBindingKey === bindingKey;
                                    const displayedShortcut = isRecording
                                        ? recordingSequence.length > 0
                                            ? formatKeySequence(recordingSequence)
                                            : m.settings_keymap_recording()
                                        : binding.keys || m.settings_keymap_unbound();

                                    return (
                                        <li
                                            className={styles.listItem}
                                            key={bindingKey}
                                        >
                                            <span className={styles.actionId}>
                                                {binding.commandId}
                                            </span>
                                            <span className={styles.scope}>
                                                {binding.context}
                                            </span>
                                            <button
                                                aria-label={m.settings_keymap_shortcut_for({
                                                    action: binding.commandId,
                                                })}
                                                className={styles.shortcutButton}
                                                type="button"
                                                onClick={() => {
                                                    setRecordingBindingKey(bindingKey);
                                                    setRecordingSequence([]);
                                                }}
                                                onKeyDown={(event) => {
                                                    if (!isRecording) {
                                                        return;
                                                    }

                                                    event.preventDefault();
                                                    event.stopPropagation();

                                                    if (event.key === "Escape") {
                                                        setRecordingBindingKey(null);
                                                        setRecordingSequence([]);
                                                        return;
                                                    }

                                                    if (event.key === "Enter") {
                                                        onKeymapSettingsChange(
                                                            upsertKeymapOverride(
                                                                keymapSettings,
                                                                binding,
                                                                recordingSequence,
                                                            ),
                                                        );
                                                        setRecordingBindingKey(null);
                                                        setRecordingSequence([]);
                                                        return;
                                                    }

                                                    const stroke =
                                                        strokeFromKeyboardEvent(event);
                                                    if (stroke) {
                                                        setRecordingSequence((current) => [
                                                            ...current,
                                                            stroke,
                                                        ]);
                                                    }
                                                }}
                                            >
                                                {displayedShortcut}
                                            </button>
                                            <div className={styles.keymapActions}>
                                                <Button
                                                    aria-label={m.settings_keymap_clear_for({
                                                        action: binding.commandId,
                                                    })}
                                                    size="small"
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={() =>
                                                        onKeymapSettingsChange(
                                                            upsertKeymapOverride(
                                                                keymapSettings,
                                                                binding,
                                                                [],
                                                            ),
                                                        )
                                                    }
                                                >
                                                    {m.settings_keymap_clear()}
                                                </Button>
                                                <Button
                                                    aria-label={m.settings_keymap_reset_for({
                                                        action: binding.commandId,
                                                    })}
                                                    size="small"
                                                    type="button"
                                                    variant="secondary"
                                                    onClick={() =>
                                                        onKeymapSettingsChange(
                                                            removeKeymapOverride(
                                                                keymapSettings,
                                                                binding,
                                                            ),
                                                        )
                                                    }
                                                >
                                                    {m.settings_keymap_reset()}
                                                </Button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    )}
                </div>
            </section>
        </div>
    );
};
