import { m } from "../paraglide/messages.js";

export const DEFAULT_PLACEMENT = "here";

export const getPlacementOptions = () => [
    { value: "here", label: m.placement_here() },
    { value: "top", label: m.placement_top() },
    { value: "bottom", label: m.placement_bottom() },
    { value: "auto", label: m.placement_auto() },
];

export const tablePlacementValue = (
    extraFields: Record<string, unknown> | undefined,
): string => {
    const raw = extraFields?.placement;
    return typeof raw === "string" && raw.length > 0 ? raw : DEFAULT_PLACEMENT;
};
