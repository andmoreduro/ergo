export const DEFAULT_KEYMAP_PROFILE_ID = "default";
export const CUSTOM_KEYMAP_PROFILE_ID = "custom";

import type { KeymapProfileRecord } from "../bindings/KeymapProfileRecord";
import type { KeymapSettings } from "../bindings/KeymapSettings";

export const normalizeKeymapSettings = (
    settings: KeymapSettings,
): KeymapSettings => {
    if (settings.profiles.length === 0) {
        const legacyOverrides = settings.keymap_overrides;
        const legacyName = settings.keymap_profile;
        const profiles: KeymapProfileRecord[] = [
            {
                id: DEFAULT_KEYMAP_PROFILE_ID,
                name: "Default",
                overrides: [],
            },
        ];

        let activeProfileId = DEFAULT_KEYMAP_PROFILE_ID;
        if (legacyOverrides.length > 0) {
            profiles.push({
                id: CUSTOM_KEYMAP_PROFILE_ID,
                name:
                    legacyName && legacyName !== "Default"
                        ? legacyName
                        : "Custom",
                overrides: legacyOverrides,
            });
            activeProfileId = CUSTOM_KEYMAP_PROFILE_ID;
        }

        return syncLegacyKeymapFields({
            ...settings,
            active_profile_id: activeProfileId,
            profiles,
        });
    }

    const activeProfile = settings.profiles.find(
        (profile) => profile.id === settings.active_profile_id,
    );
    const activeProfileId =
        activeProfile?.id ??
        settings.profiles[0]?.id ??
        DEFAULT_KEYMAP_PROFILE_ID;

    return syncLegacyKeymapFields({
        ...settings,
        active_profile_id: activeProfileId,
    });
};

export const syncLegacyKeymapFields = (
    settings: KeymapSettings,
): KeymapSettings => {
    const activeProfile = settings.profiles.find(
        (profile) => profile.id === settings.active_profile_id,
    );

    if (!activeProfile) {
        return settings;
    }

    return {
        ...settings,
        keymap_profile: activeProfile.name,
        keymap_overrides: activeProfile.overrides,
    };
};

export const ensureCustomProfileForEdit = (
    settings: KeymapSettings,
): KeymapSettings => {
    const normalized = normalizeKeymapSettings(settings);
    if (normalized.active_profile_id !== DEFAULT_KEYMAP_PROFILE_ID) {
        return normalized;
    }

    const customProfile = normalized.profiles.find(
        (profile) => profile.id === CUSTOM_KEYMAP_PROFILE_ID,
    );
    const profiles = customProfile
        ? normalized.profiles
        : [
              ...normalized.profiles,
              {
                  id: CUSTOM_KEYMAP_PROFILE_ID,
                  name: "Custom",
                  overrides: [],
              },
          ];

    return syncLegacyKeymapFields({
        ...normalized,
        active_profile_id: CUSTOM_KEYMAP_PROFILE_ID,
        profiles,
    });
};

export const setActiveKeymapProfile = (
    settings: KeymapSettings,
    profileId: string,
): KeymapSettings =>
    syncLegacyKeymapFields(
        normalizeKeymapSettings({
            ...settings,
            active_profile_id: profileId,
        }),
    );

export const renameActiveKeymapProfile = (
    settings: KeymapSettings,
    name: string,
): KeymapSettings => {
    const trimmed = name.trim();
    if (!trimmed) {
        return settings;
    }

    const normalized = normalizeKeymapSettings(settings);
    const profiles = normalized.profiles.map((profile) =>
        profile.id === normalized.active_profile_id
            ? { ...profile, name: trimmed }
            : profile,
    );

    return syncLegacyKeymapFields({
        ...normalized,
        profiles,
    });
};

export const updateActiveProfileOverrides = (
    settings: KeymapSettings,
    overrides: KeymapSettings["keymap_overrides"],
): KeymapSettings => {
    const normalized = normalizeKeymapSettings(settings);
    const profiles = normalized.profiles.map((profile) =>
        profile.id === normalized.active_profile_id
            ? { ...profile, overrides }
            : profile,
    );

    return syncLegacyKeymapFields({
        ...normalized,
        profiles,
    });
};
