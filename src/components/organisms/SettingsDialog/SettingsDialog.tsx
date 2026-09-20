import type { TemplateOverride } from "../../../bindings/TemplateOverride";
import type { TemplateOptionSpec } from "../../../bindings/TemplateOptionSpec";
import type { TemplateVariantSpec } from "../../../bindings/TemplateVariantSpec";
import { m } from "../../../paraglide/messages.js";
import { Dialog } from "../../molecules/Dialog/Dialog";
import { DialogContext } from "../../../actions/contexts/DialogContext";
import { GlobalSettingsPanel } from "./GlobalSettingsPanel";
import { ProjectSettingsPanel } from "./ProjectSettingsPanel";
import { KeymapSettingsPanel } from "./KeymapSettingsPanel";

export type SettingsPanel = "global" | "project" | "keymap";

/**
 * Settings dialog shell. Global and keymap settings come from the
 * `SettingsProvider`; project settings from the document; only the template
 * context (spec-driven options, variants, fonts) is threaded in from the app.
 */
export interface SettingsDialogProps {
    panel: SettingsPanel;
    hasActiveProject?: boolean;
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
    hasActiveProject = false,
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
            {panel === "global" && <GlobalSettingsPanel />}

            {panel === "project" && (
                <ProjectSettingsPanel
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
                <KeymapSettingsPanel hasActiveProject={hasActiveProject} />
            )}
        </Dialog>
        </DialogContext>
    );
};
