import type { FontAvailability } from "../bindings/FontAvailability";
import type { ProjectFontAvailability } from "../bindings/ProjectFontAvailability";
import type { ProjectSettings } from "../bindings/ProjectSettings";
import { TauriApi } from "../api/tauri";
import { m } from "../paraglide/messages.js";

const unavailableFonts = (
    availability: ProjectFontAvailability,
): FontAvailability[] =>
    [availability.textFont, availability.mathFont, availability.rawFont].filter(
        (entry) => entry.requested && !entry.available,
    );

export async function checkProjectFontAvailability(
    settings: ProjectSettings,
): Promise<ProjectFontAvailability> {
    return TauriApi.checkProjectFonts(settings);
}

export function fontUnavailableMessage(entry: FontAvailability): string {
    return m.settings_font_not_available({
        font: entry.requested ?? "",
        fallback: entry.fallback,
    });
}

export function projectFontsUnavailableToastMessage(
    availability: ProjectFontAvailability,
): string | null {
    const missing = unavailableFonts(availability);
    if (missing.length === 0) {
        return null;
    }

    const names = missing
        .map((entry) => entry.requested)
        .filter((name): name is string => Boolean(name))
        .join(", ");

    const fallbacks = [...new Set(missing.map((entry) => entry.fallback))].join(", ");

    return m.project_fonts_unavailable_toast({
        fonts: names,
        fallbacks,
    });
}

export function emitProjectFontToast(message: string): void {
    window.dispatchEvent(
        new CustomEvent("ergo:toast", {
            detail: { message },
        }),
    );
}

export async function notifyUnavailableProjectFonts(
    settings: ProjectSettings,
): Promise<ProjectFontAvailability> {
    const availability = await checkProjectFontAvailability(settings);
    const message = projectFontsUnavailableToastMessage(availability);
    if (message) {
        emitProjectFontToast(message);
    }
    return availability;
}
