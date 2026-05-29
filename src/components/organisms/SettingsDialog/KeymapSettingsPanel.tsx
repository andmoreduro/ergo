import { useState } from "react";
import type { KeymapSettings } from "../../../bindings/KeymapSettings";
import type { KeyStroke } from "../../../bindings/KeyStroke";
import type { KeymapProfile } from "../../../commands/types";
import { m } from "../../../paraglide/messages.js";
import { formatKeySequence } from "../../../settings/keymap";
import { Button } from "../../atoms/Button/Button";
import { MenuItemButton } from "../../atoms/MenuItemButton/MenuItemButton";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { FormField } from "../../molecules/FormField/FormField";
import styles from "./SettingsDialog.module.css";
import {
    removeKeymapOverride,
    strokeFromKeyboardEvent,
    upsertKeymapOverride,
} from "./settingsDialogUtils";

export interface KeymapSettingsPanelProps {
    settings: KeymapSettings;
    keymap: KeymapProfile;
    conflicts: unknown[];
    onChange: (settings: KeymapSettings) => void;
}

export const KeymapSettingsPanel = ({
    settings,
    keymap,
    conflicts,
    onChange,
}: KeymapSettingsPanelProps) => {
    const [recordingBindingKey, setRecordingBindingKey] = useState<string | null>(
        null,
    );
    const [recordingSequence, setRecordingSequence] = useState<KeyStroke[]>([]);

    return (
        <>
            <FormField label={m.settings_keymap_profile()}>
                <TextInput
                    aria-label={m.settings_keymap_profile()}
                    fullWidth
                    value={settings.keymap_profile ?? "Default"}
                    onChange={(event) =>
                        onChange({
                            ...settings,
                            keymap_profile:
                                event.target.value.trim() || "Default",
                        })
                    }
                />
            </FormField>
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
                    const isRecording = recordingBindingKey === bindingKey;
                    const displayedShortcut = isRecording
                        ? recordingSequence.length > 0
                            ? formatKeySequence(recordingSequence)
                            : m.settings_keymap_recording()
                        : binding.keys || m.settings_keymap_unbound();

                    return (
                        <li className={styles.listItem} key={bindingKey}>
                            <span className={styles.actionId}>
                                {binding.commandId}
                            </span>
                            <span className={styles.scope}>
                                {binding.context}
                            </span>
                            <MenuItemButton
                                variant="keymap"
                                aria-label={m.settings_keymap_shortcut_for({
                                    action: binding.commandId,
                                })}
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
                                        onChange(
                                            upsertKeymapOverride(
                                                settings,
                                                binding,
                                                recordingSequence,
                                            ),
                                        );
                                        setRecordingBindingKey(null);
                                        setRecordingSequence([]);
                                        return;
                                    }

                                    const stroke = strokeFromKeyboardEvent(event);
                                    if (stroke) {
                                        setRecordingSequence((current) => [
                                            ...current,
                                            stroke,
                                        ]);
                                    }
                                }}
                            >
                                {displayedShortcut}
                            </MenuItemButton>
                            <div className={styles.keymapActions}>
                                <Button
                                    aria-label={m.settings_keymap_clear_for({
                                        action: binding.commandId,
                                    })}
                                    size="small"
                                    type="button"
                                    variant="ghost"
                                    onClick={() =>
                                        onChange(
                                            upsertKeymapOverride(
                                                settings,
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
                                        onChange(
                                            removeKeymapOverride(
                                                settings,
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
    );
};
