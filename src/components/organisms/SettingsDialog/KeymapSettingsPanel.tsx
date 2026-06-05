import { Edit24Regular } from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";
import { TauriApi } from "../../../api/tauri";
import {
    formatActionCatalogLabel,
    resolveKeymapCategoryLabel,
} from "../../../actions/actionMessages";
import type { ActionDescriptor } from "../../../bindings/ActionDescriptor";
import type { KeymapSettings } from "../../../bindings/KeymapSettings";
import type { KeyStroke } from "../../../bindings/KeyStroke";
import type { KeymapProfile } from "../../../commands/types";
import { m } from "../../../paraglide/messages.js";
import {
    buildKeymapSettingRows,
    groupKeymapRowsByCategory,
    rowBindingKey,
    rowHasConflict,
} from "../../../settings/keymapCatalog";
import { formatKeySequence } from "../../../settings/keymap";
import {
    normalizeKeymapSettings,
    renameActiveKeymapProfile,
    setActiveKeymapProfile,
} from "../../../settings/keymapProfiles";
import { Button } from "../../atoms/Button/Button";
import { Combobox } from "../../atoms/Combobox/Combobox";
import { IconButton } from "../../atoms/IconButton/IconButton";
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
    hasActiveProject?: boolean;
    onChange: (settings: KeymapSettings) => void;
}

export const KeymapSettingsPanel = ({
    settings,
    keymap,
    conflicts,
    hasActiveProject = true,
    onChange,
}: KeymapSettingsPanelProps) => {
    const [recordingBindingKey, setRecordingBindingKey] = useState<string | null>(
        null,
    );
    const [recordingSequence, setRecordingSequence] = useState<KeyStroke[]>([]);
    const [catalog, setCatalog] = useState<ActionDescriptor[]>([]);
    const [renamingProfile, setRenamingProfile] = useState(false);
    const [profileNameDraft, setProfileNameDraft] = useState("");

    useEffect(() => {
        void TauriApi.getActionCatalog()
            .then(setCatalog)
            .catch(() => setCatalog([]));
    }, []);

    const normalizedSettings = useMemo(
        () => normalizeKeymapSettings(settings),
        [settings],
    );
    const activeProfile =
        normalizedSettings.profiles.find(
            (profile) => profile.id === normalizedSettings.active_profile_id,
        ) ?? normalizedSettings.profiles[0];
    const profileOptions = normalizedSettings.profiles.map(
        (profile) => profile.name,
    );
    const rows = useMemo(
        () => buildKeymapSettingRows(catalog, keymap),
        [catalog, keymap],
    );
    const groupedRows = useMemo(() => groupKeymapRowsByCategory(rows), [rows]);
    const conflictList = conflicts as Array<{
        action_id?: string;
        context?: string;
    }>;

    const commitRecording = (bindingKey: string, sequence: KeyStroke[]) => {
        const row = rows.find((entry) => rowBindingKey(entry) === bindingKey);
        if (!row) {
            return;
        }

        onChange(
            upsertKeymapOverride(
                settings,
                {
                    commandId: row.actionId,
                    context: row.context,
                    keys: formatKeySequence(sequence),
                    scope: "editor",
                    sequence,
                },
                sequence,
            ),
        );
        setRecordingBindingKey(null);
        setRecordingSequence([]);
    };

    return (
        <>
            <div className={styles.keymapProfileRow}>
                <FormField label={m.settings_keymap_profile()}>
                    <Combobox
                        aria-label={m.settings_keymap_profile()}
                        filterable={false}
                        fullWidth
                        options={profileOptions}
                        value={activeProfile?.name ?? "Default"}
                        onChange={(name) => {
                            const profile = normalizedSettings.profiles.find(
                                (entry) => entry.name === name,
                            );
                            if (!profile) {
                                return;
                            }
                            onChange(
                                setActiveKeymapProfile(settings, profile.id),
                            );
                        }}
                    />
                </FormField>
                <IconButton
                    aria-label={m.settings_keymap_rename_profile()}
                    title={m.settings_keymap_rename_profile()}
                    type="button"
                    onClick={() => {
                        setProfileNameDraft(activeProfile?.name ?? "Default");
                        setRenamingProfile(true);
                    }}
                >
                    <Edit24Regular />
                </IconButton>
            </div>
            {renamingProfile ? (
                <div className={styles.keymapRenameRow}>
                    <TextInput
                        aria-label={m.settings_keymap_rename_profile()}
                        fullWidth
                        value={profileNameDraft}
                        onChange={(event) =>
                            setProfileNameDraft(event.target.value)
                        }
                    />
                    <Button
                        size="small"
                        type="button"
                        onClick={() => {
                            onChange(
                                renameActiveKeymapProfile(
                                    settings,
                                    profileNameDraft,
                                ),
                            );
                            setRenamingProfile(false);
                        }}
                    >
                        {m.settings_keymap_rename_save()}
                    </Button>
                    <Button
                        size="small"
                        type="button"
                        variant="ghost"
                        onClick={() => setRenamingProfile(false)}
                    >
                        {m.settings_keymap_rename_cancel()}
                    </Button>
                </div>
            ) : null}
            {recordingBindingKey ? (
                <p className={styles.keymapCaptureBanner}>
                    {m.settings_keymap_capture_banner()}
                </p>
            ) : null}
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
            {groupedRows.map(({ category, rows: categoryRows }) => (
                <section className={styles.keymapCategory} key={category}>
                    <h4 className={styles.keymapCategoryTitle}>
                        {resolveKeymapCategoryLabel(category)}
                    </h4>
                    <ul className={styles.list}>
                        {categoryRows.map((row) => {
                            const bindingKey = rowBindingKey(row);
                            const isRecording = recordingBindingKey === bindingKey;
                            const displayedShortcut = isRecording
                                ? recordingSequence.length > 0
                                    ? formatKeySequence(recordingSequence)
                                    : m.settings_keymap_recording()
                                : row.keys || m.settings_keymap_unbound();
                            const hasConflict = rowHasConflict(row, conflictList);
                            const rowDisabled =
                                row.requiresProject && !hasActiveProject;

                            return (
                                <li
                                    className={
                                        isRecording
                                            ? `${styles.listItem} ${styles.keymapRowRecording}`
                                            : styles.listItem
                                    }
                                    key={bindingKey}
                                    title={
                                        rowDisabled
                                            ? m.settings_keymap_requires_project()
                                            : undefined
                                    }
                                >
                                    <span className={styles.keymapActionLabel}>
                                        {formatActionCatalogLabel(
                                            row.actionId,
                                            row.descriptionKey,
                                        )}
                                    </span>
                                    <span
                                        className={styles.scope}
                                        title={row.context}
                                    >
                                        {row.context}
                                    </span>
                                    <MenuItemButton
                                        variant="keymap"
                                        disabled={rowDisabled}
                                        aria-label={m.settings_keymap_shortcut_for(
                                            {
                                                action: formatActionCatalogLabel(
                                                    row.actionId,
                                                    row.descriptionKey,
                                                ),
                                            },
                                        )}
                                        onClick={() => {
                                            if (rowDisabled) {
                                                return;
                                            }
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

                                            const saveShortcut =
                                                event.key === "Enter" &&
                                                (event.ctrlKey || event.metaKey);
                                            if (saveShortcut) {
                                                commitRecording(
                                                    bindingKey,
                                                    recordingSequence,
                                                );
                                                return;
                                            }

                                            if (event.key === "Enter") {
                                                const stroke =
                                                    strokeFromKeyboardEvent(
                                                        event,
                                                    );
                                                if (stroke) {
                                                    setRecordingSequence(
                                                        (current) => [
                                                            ...current,
                                                            stroke,
                                                        ],
                                                    );
                                                }
                                                return;
                                            }

                                            const stroke =
                                                strokeFromKeyboardEvent(event);
                                            if (stroke) {
                                                setRecordingSequence(
                                                    (current) => [
                                                        ...current,
                                                        stroke,
                                                    ],
                                                );
                                            }
                                        }}
                                    >
                                        {displayedShortcut}
                                    </MenuItemButton>
                                    <div className={styles.keymapActions}>
                                        {hasConflict ? (
                                            <span className={styles.warning}>
                                                {m.settings_keymap_row_conflict()}
                                            </span>
                                        ) : null}
                                        <Button
                                            aria-label={m.settings_keymap_clear_for(
                                                {
                                                    action: formatActionCatalogLabel(
                                                        row.actionId,
                                                        row.descriptionKey,
                                                    ),
                                                },
                                            )}
                                            disabled={rowDisabled}
                                            size="small"
                                            type="button"
                                            variant="ghost"
                                            onClick={() =>
                                                onChange(
                                                    upsertKeymapOverride(
                                                        settings,
                                                        {
                                                            commandId:
                                                                row.actionId,
                                                            context: row.context,
                                                            keys: "",
                                                            scope: "editor",
                                                            sequence: [],
                                                        },
                                                        [],
                                                    ),
                                                )
                                            }
                                        >
                                            {m.settings_keymap_clear()}
                                        </Button>
                                        <Button
                                            aria-label={m.settings_keymap_reset_for(
                                                {
                                                    action: formatActionCatalogLabel(
                                                        row.actionId,
                                                        row.descriptionKey,
                                                    ),
                                                },
                                            )}
                                            disabled={rowDisabled}
                                            size="small"
                                            type="button"
                                            variant="secondary"
                                            onClick={() =>
                                                onChange(
                                                    removeKeymapOverride(
                                                        settings,
                                                        {
                                                            commandId:
                                                                row.actionId,
                                                            context: row.context,
                                                            keys: row.keys,
                                                            scope: "editor",
                                                            sequence:
                                                                row.sequence,
                                                        },
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
                </section>
            ))}
        </>
    );
};
