import type { GlobalSettings } from "../../../bindings/GlobalSettings";
import type { KeymapSettings } from "../../../bindings/KeymapSettings";
import type { ProjectSettings } from "../../../bindings/ProjectSettings";
import type { TemplateOverride } from "../../../bindings/TemplateOverride";
import type { TemplateOptionSpec } from "../../../bindings/TemplateOptionSpec";
import type { TemplateVariantSpec } from "../../../bindings/TemplateVariantSpec";
import type { KeymapProfile } from "../../../commands/types";
import { m } from "../../../paraglide/messages.js";
import { Dialog } from "../../molecules/Dialog/Dialog";
import { DialogContext } from "../../../actions/contexts/DialogContext";
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
    hasActiveProject?: boolean;
    onGlobalSettingsChange: (settings: GlobalSettings) => void;
    onKeymapSettingsChange: (settings: KeymapSettings) => void;
    onProjectSettingsChange: (settings: ProjectSettings) => void;
    templateDefaultOverrides?: TemplateOverride[];
    templateOptions?: TemplateOptionSpec[];
    templateVariants?: TemplateVariantSpec[];
    templateVariantId?: string | null;
    onTemplateVariantChange?: (variantId: string) => void;
    systemFonts?: string[];
    t?: (key: string) => string;
    onClose: () => void;
}

export const SettingsDialog = ({
    panel,
    globalSettings,
    projectSettings,
    keymapSettings,
    keymap,
    conflicts,
    hasActiveProject = false,
    onGlobalSettingsChange,
    onKeymapSettingsChange,
    onProjectSettingsChange,
    templateDefaultOverrides,
    templateOptions,
    templateVariants,
    templateVariantId,
    onTemplateVariantChange,
    systemFonts,
    t,
    onClose,
}: SettingsDialogProps) => {
    const title =
        panel === "project"
            ? m.settings_project_title()
            : panel === "keymap"
              ? m.settings_keymap_title()
              : m.settings_global_title();

    return (
        <DialogContext id="settings-dialog" kind={panel} active>
        <Dialog
            size="xl"
            title={title}
            titleId="settings-title"
            cancelAction={{
                label: m.command_palette_close(),
                onClick: onClose,
            }}
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
                    templateDefaultOverrides={templateDefaultOverrides}
                    templateOptions={templateOptions}
                    templateVariants={templateVariants}
                    templateVariantId={templateVariantId}
                    onTemplateVariantChange={onTemplateVariantChange}
                    systemFonts={systemFonts}
                    t={t}
                />
            )}

            {panel === "keymap" && (
                <KeymapSettingsPanel
                    settings={keymapSettings}
                    keymap={keymap}
                    conflicts={conflicts}
                    hasActiveProject={hasActiveProject}
                    onChange={onKeymapSettingsChange}
                />
            )}
        </Dialog>
        </DialogContext>
    );
};
