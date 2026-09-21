import { Checkmark24Regular, Dismiss24Regular, Edit24Regular } from "@fluentui/react-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TauriApi } from "../../../api/tauri";
import {
    formatActionCatalogLabel,
    resolveKeymapCategoryLabel,
} from "../../../actions/actionMessages";
import { KEY_CAPTURE_ATTRIBUTE } from "../../../actions/runtime";
import type { ActionDescriptor } from "../../../bindings/ActionDescriptor";
import type { KeyStroke } from "../../../bindings/KeyStroke";
import type { KeymapConflict } from "../../../bindings/KeymapConflict";
import type { KeymapSettings } from "../../../bindings/KeymapSettings";
import type { KeyBinding } from "../../../commands/types";
import { m } from "../../../paraglide/messages.js";
import { useKeymap, useSettingsActions } from "../../../settings/SettingsProvider";
import {
    buildKeymapSettingRows,
    formatPayloadSummary,
    groupKeymapRowsByCategory,
    rowBindingKey,
    rowHasConflict,
    type KeymapSettingRow,
} from "../../../settings/keymap/catalog";
import { bindingIdentity, formatKeySequence } from "../../../settings/keymap/profile";
import {
    normalizeKeymapSettings,
    renameActiveKeymapProfile,
    setActiveKeymapProfile,
} from "../../../settings/keymap/profiles";
import { Button } from "../../atoms/Button/Button";
import { Combobox } from "../../atoms/Combobox/Combobox";
import { IconButton } from "../../atoms/IconButton/IconButton";
import { MenuItemButton } from "../../atoms/MenuItemButton/MenuItemButton";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { FormField } from "../../molecules/FormField/FormField";
import styles from "./SettingsDialog.module.css";
import {
    hasKeymapOverride,
    removeKeymapOverride,
    strokeFromKeyboardEvent,
    unbindKeymapIdentity,
    upsertKeymapOverride,
} from "./settingsDialogUtils";

export interface KeymapSettingsPanelProps {
    hasActiveProject?: boolean;
}

interface Recording {
    /** Identity of the row being recorded (see `rowBindingKey`). */
    rowKey: string;
    strokes: KeyStroke[];
    /** A conflict found on commit; the recording stays open so the user can decide. */
    conflict: KeymapConflict | null;
}

const rowAsBinding = (row: KeymapSettingRow): KeyBinding => ({
    commandId: row.actionId,
    context: row.context,
    keys: row.keys,
    scope: "editor",
    sequence: row.sequence,
    payload: row.payload,
});

/** Conflicts that involve this row's identity (either side of the pair). */
const conflictForRow = (
    conflicts: KeymapConflict[],
    row: KeymapSettingRow,
): KeymapConflict | null => {
    const identity = rowBindingKey(row);
    return (
        conflicts.find(
            (conflict) =>
                bindingIdentity(conflict.action_id, conflict.context, conflict.payload) ===
                    identity ||
                bindingIdentity(
                    conflict.conflicting_action_id,
                    conflict.conflicting_context,
                    conflict.conflicting_payload,
                ) === identity,
        ) ?? null
    );
};

/** The binding on the other side of a conflict involving `row`. */
const otherSideOfConflict = (
    conflict: KeymapConflict,
    row: KeymapSettingRow,
): KeyBinding => {
    const rowIsLeft =
        bindingIdentity(conflict.action_id, conflict.context, conflict.payload) ===
        rowBindingKey(row);
    return {
        commandId: rowIsLeft ? conflict.conflicting_action_id : conflict.action_id,
        context: rowIsLeft ? conflict.conflicting_context : conflict.context,
        payload: rowIsLeft ? conflict.conflicting_payload : conflict.payload,
        keys: formatKeySequence(conflict.sequence),
        scope: "editor",
        sequence: conflict.sequence,
    };
};

/**
 * Keymap settings: one row per binding identity (action + context + payload),
 * recorded in place. Recording owns every keystroke (the action runtime, the
 * dialog and the focus trap all step aside, see `KEY_CAPTURE_ATTRIBUTE`), saves
 * on ✓ or when focus leaves the recorder, and refuses shortcuts that would be
 * ambiguous with another binding — the user can replace the other binding
 * explicitly instead.
 */
export const KeymapSettingsPanel = ({
    hasActiveProject = true,
}: KeymapSettingsPanelProps) => {
    const { settings, keymap, conflicts } = useKeymap();
    const { updateKeymapSettings: onChange } = useSettingsActions();
    const [recording, setRecording] = useState<Recording | null>(null);
    const recordingRef = useRef<Recording | null>(null);
    recordingRef.current = recording;
    const [catalog, setCatalog] = useState<ActionDescriptor[]>([]);
    const [renamingProfile, setRenamingProfile] = useState(false);
    const [profileNameDraft, setProfileNameDraft] = useState("");
    const settingsRef = useRef(settings);
    settingsRef.current = settings;

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
    const rowsRef = useRef(rows);
    rowsRef.current = rows;
    const groupedRows = useMemo(() => groupKeymapRowsByCategory(rows), [rows]);
    const conflictList = conflicts as KeymapConflict[];

    /**
     * Validate a candidate keymap for the recorded row. Resolves with the
     * conflict that blocks it, or null when it can be applied.
     */
    const findBlockingConflict = useCallback(
        async (candidate: KeymapSettings, row: KeymapSettingRow) => {
            if (typeof TauriApi.validateKeymapSettings !== "function") {
                return null;
            }
            try {
                const result = await TauriApi.validateKeymapSettings(candidate);
                return conflictForRow(result.conflicts, row);
            } catch {
                return null;
            }
        },
        [],
    );

    const commitRecording = useCallback(
        async (current: Recording, options?: { replaceConflicting?: boolean }) => {
            const row = rowsRef.current.find(
                (entry) => rowBindingKey(entry) === current.rowKey,
            );
            if (!row || current.strokes.length === 0) {
                setRecording(null);
                return;
            }
            let base = settingsRef.current;
            if (options?.replaceConflicting && current.conflict) {
                base = unbindKeymapIdentity(base, otherSideOfConflict(current.conflict, row));
            }
            const candidate = upsertKeymapOverride(base, rowAsBinding(row), current.strokes);
            const blocking = await findBlockingConflict(candidate, row);
            if (blocking) {
                setRecording((previous) =>
                    previous && previous.rowKey === current.rowKey
                        ? { ...previous, conflict: blocking }
                        : previous,
                );
                return;
            }
            onChange(candidate);
            setRecording(null);
        },
        [findBlockingConflict, onChange],
    );

    // Closing the dialog mid-recording must not lose the shortcut: commit what
    // was recorded (the conflict check still applies; a conflict is dropped).
    const commitRef = useRef(commitRecording);
    commitRef.current = commitRecording;
    useEffect(
        () => () => {
            const pending = recordingRef.current;
            if (pending && pending.strokes.length > 0 && !pending.conflict) {
                void commitRef.current(pending);
            }
        },
        [],
    );

    const cancelRecording = () => setRecording(null);

    const startRecording = (row: KeymapSettingRow) =>
        setRecording({ rowKey: rowBindingKey(row), strokes: [], conflict: null });

    const conflictMessage = (conflict: KeymapConflict, row: KeymapSettingRow) => {
        const other = otherSideOfConflict(conflict, row);
        const otherAction = catalog.find((action) => action.id === other.commandId);
        return m.settings_keymap_conflict_with({
            keys: formatKeySequence(conflict.sequence),
            action: formatActionCatalogLabel(
                other.commandId,
                otherAction?.description_key ?? `${other.commandId}_description`,
            ),
            context: other.context,
        });
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
            {recording ? (
                <p className={styles.keymapCaptureBanner}>
                    {m.settings_keymap_capture_banner()}
                </p>
            ) : null}
            <h3 className={styles.sectionTitle}>
                {m.settings_keymap_bindings()}
            </h3>
            {conflictList.length > 0 ? (
                <p className={styles.warning}>
                    {m.settings_keymap_conflicts({
                        count: conflictList.length,
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
                            const rowKey = rowBindingKey(row);
                            const isRecording = recording?.rowKey === rowKey;
                            const displayedShortcut = isRecording
                                ? recording.strokes.length > 0
                                    ? formatKeySequence(recording.strokes)
                                    : m.settings_keymap_recording()
                                : row.keys || m.settings_keymap_unbound();
                            const hasConflict = rowHasConflict(row, conflictList);
                            const rowDisabled =
                                row.requiresProject && !hasActiveProject;
                            const actionLabel = formatActionCatalogLabel(
                                row.actionId,
                                row.descriptionKey,
                            );
                            const payloadSummary = formatPayloadSummary(row.payload);
                            const overridden = hasKeymapOverride(settings, rowAsBinding(row));

                            return (
                                <li
                                    className={
                                        isRecording
                                            ? `${styles.listItem} ${styles.keymapRowRecording}`
                                            : styles.listItem
                                    }
                                    key={rowKey}
                                    title={
                                        rowDisabled
                                            ? m.settings_keymap_requires_project()
                                            : row.sequences.length > 1
                                              ? m.settings_keymap_alternatives_note()
                                              : undefined
                                    }
                                >
                                    <span className={styles.keymapActionLabel}>
                                        {actionLabel}
                                        {payloadSummary ? (
                                            <span className={styles.keymapPayload}>
                                                {payloadSummary}
                                            </span>
                                        ) : null}
                                    </span>
                                    <span
                                        className={styles.scope}
                                        title={row.context}
                                    >
                                        {row.context}
                                    </span>
                                    <div className={styles.keymapRecorderRow}>
                                        <MenuItemButton
                                            variant="keymap"
                                            disabled={rowDisabled}
                                            aria-label={m.settings_keymap_shortcut_for({
                                                action: actionLabel,
                                            })}
                                            {...{ [KEY_CAPTURE_ATTRIBUTE]: isRecording ? "true" : undefined }}
                                            onClick={() => {
                                                if (rowDisabled || isRecording) {
                                                    return;
                                                }
                                                startRecording(row);
                                            }}
                                            onBlur={() => {
                                                const current = recordingRef.current;
                                                if (!current || current.rowKey !== rowKey) {
                                                    return;
                                                }
                                                if (current.strokes.length === 0 || current.conflict) {
                                                    // Nothing recorded, or waiting on the
                                                    // conflict decision: leave the row as is.
                                                    if (!current.conflict) {
                                                        setRecording(null);
                                                    }
                                                    return;
                                                }
                                                void commitRecording(current);
                                            }}
                                            onKeyDown={(event) => {
                                                if (!isRecording) {
                                                    return;
                                                }
                                                event.preventDefault();
                                                event.stopPropagation();
                                                if (event.key === "Escape") {
                                                    cancelRecording();
                                                    return;
                                                }
                                                const stroke = strokeFromKeyboardEvent(
                                                    event.nativeEvent,
                                                );
                                                if (!stroke) {
                                                    return;
                                                }
                                                setRecording((previous) =>
                                                    previous && previous.rowKey === rowKey
                                                        ? {
                                                              ...previous,
                                                              strokes: [...previous.strokes, stroke],
                                                              conflict: null,
                                                          }
                                                        : previous,
                                                );
                                            }}
                                        >
                                            {displayedShortcut}
                                        </MenuItemButton>
                                        {isRecording ? (
                                            <>
                                                <IconButton
                                                    aria-label={m.settings_keymap_save()}
                                                    title={m.settings_keymap_save()}
                                                    type="button"
                                                    disabled={recording.strokes.length === 0}
                                                    onMouseDown={(event) => event.preventDefault()}
                                                    onClick={() => void commitRecording(recording)}
                                                >
                                                    <Checkmark24Regular />
                                                </IconButton>
                                                <IconButton
                                                    aria-label={m.settings_keymap_cancel()}
                                                    title={m.settings_keymap_cancel()}
                                                    type="button"
                                                    onMouseDown={(event) => event.preventDefault()}
                                                    onClick={cancelRecording}
                                                >
                                                    <Dismiss24Regular />
                                                </IconButton>
                                            </>
                                        ) : null}
                                        {isRecording && recording.conflict ? (
                                            <span className={styles.keymapRecorderError}>
                                                {conflictMessage(recording.conflict, row)}{" "}
                                                <Button
                                                    size="small"
                                                    type="button"
                                                    variant="secondary"
                                                    onMouseDown={(event) => event.preventDefault()}
                                                    onClick={() =>
                                                        void commitRecording(recording, {
                                                            replaceConflicting: true,
                                                        })
                                                    }
                                                >
                                                    {m.settings_keymap_replace()}
                                                </Button>
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className={styles.keymapActions}>
                                        {hasConflict && !isRecording ? (
                                            <span className={styles.warning}>
                                                {m.settings_keymap_row_conflict()}
                                            </span>
                                        ) : null}
                                        {row.keys ? (
                                            <Button
                                                aria-label={m.settings_keymap_unbind_for({
                                                    action: actionLabel,
                                                })}
                                                disabled={rowDisabled}
                                                size="small"
                                                type="button"
                                                variant="ghost"
                                                onClick={() =>
                                                    onChange(
                                                        unbindKeymapIdentity(
                                                            settings,
                                                            rowAsBinding(row),
                                                        ),
                                                    )
                                                }
                                            >
                                                {m.settings_keymap_unbind()}
                                            </Button>
                                        ) : null}
                                        {overridden ? (
                                            <Button
                                                aria-label={m.settings_keymap_reset_for({
                                                    action: actionLabel,
                                                })}
                                                disabled={rowDisabled}
                                                size="small"
                                                type="button"
                                                variant="secondary"
                                                onClick={() =>
                                                    onChange(
                                                        removeKeymapOverride(
                                                            settings,
                                                            rowAsBinding(row),
                                                        ),
                                                    )
                                                }
                                            >
                                                {m.settings_keymap_reset()}
                                            </Button>
                                        ) : null}
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
