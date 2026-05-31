import type { GlobalSettings } from "../../../bindings/GlobalSettings";
import type { KeymapSettings } from "../../../bindings/KeymapSettings";
import type { ProjectSettings } from "../../../bindings/ProjectSettings";
import type { TemplateVariantSpec } from "../../../bindings/TemplateVariantSpec";
import type { KeymapProfile } from "../../../commands/types";
import { m } from "../../../paraglide/messages.js";
import { Dialog } from "../../molecules/Dialog/Dialog";
import { GlobalSettingsPanel } from "./GlobalSettingsPanel";
import { ProjectSettingsPanel } from "./ProjectSettingsPanel";
import { KeymapSettingsPanel } from "./KeymapSettingsPanel";

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
    templateVariants?: TemplateVariantSpec[];
    templateVariantId?: string | null;
    onTemplateVariantChange?: (variantId: string) => void;
    onClose: () => void;
}

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
    templateVariants,
    templateVariantId,
    onTemplateVariantChange,
    onClose,
}: SettingsDialogProps) => {
    const title =
        panel === "project"
            ? m.settings_project_title()
            : panel === "keymap"
              ? m.settings_keymap_title()
              : m.settings_global_title();

    return (
        <Dialog
            closeLabel={m.command_palette_close()}
            size="xl"
            title={title}
            titleId="settings-title"
            zIndex={20}
            onClose={onClose}
        >
            {panel === "global" && (
                <GlobalSettingsPanel
                    settings={globalSettings}
                    onChange={onGlobalSettingsChange}
                />
            )}

            {panel === "project" && (
                <ProjectSettingsPanel
                    settings={projectSettings}
                    onChange={onProjectSettingsChange}
                    templateVariants={templateVariants}
                    templateVariantId={templateVariantId}
                    onTemplateVariantChange={onTemplateVariantChange}
                />
            )}

            {panel === "keymap" && (
                <KeymapSettingsPanel
                    settings={keymapSettings}
                    keymap={keymap}
                    conflicts={conflicts}
                    onChange={onKeymapSettingsChange}
                />
            )}
        </Dialog>
    );
};
