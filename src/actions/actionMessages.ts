import { m } from "../paraglide/messages.js";

type MessageFn = () => string;

const messageLookup = (key: string): MessageFn | undefined => {
    const candidate = (m as Record<string, unknown>)[key];
    return typeof candidate === "function" ? (candidate as MessageFn) : undefined;
};

const ACTION_LABEL_FALLBACKS: Record<string, () => string> = {
    action_workspace_new_project: () => m.menubar_new_project(),
    action_workspace_open_project: () => m.menubar_open_project(),
    action_workspace_save_project: () => m.menubar_save_project(),
    action_workspace_close_project: () => m.menubar_close_project(),
    action_workspace_export_svg: () => m.export_format_svg(),
    action_edit_undo: () => m.menubar_undo(),
    action_edit_redo: () => m.menubar_redo(),
    action_editor_delete_element: () => m.menubar_delete_element(),
    action_editor_insert_paragraph: () => m.menubar_insert_paragraph(),
    action_editor_insert_heading: () => m.menubar_insert_heading(),
    action_editor_insert_table: () => m.menubar_insert_table(),
    action_editor_insert_figure: () => m.menubar_insert_figure(),
    action_editor_insert_equation: () => m.menubar_insert_equation(),
    action_editor_insert_block_equation: () => m.menubar_insert_block_equation(),
    action_editor_insert_inline_equation: () => m.menubar_insert_inline_equation(),
    action_editor_insert_quote: () => m.menubar_insert_quote(),
    action_editor_insert_diagram: () => m.menubar_insert_diagram(),
    action_editor_insert_list: () => m.menubar_insert_list(),
    action_editor_insert_enumeration: () => m.menubar_insert_enumeration(),
    action_editor_insert_reference: () => m.menubar_insert_reference(),
    action_editor_bold: () => m.menubar_text_bold(),
    action_editor_italic: () => m.menubar_text_italic(),
    action_editor_underline: () => m.menubar_text_underline(),
    action_view_open_command_palette: () => m.menubar_command_palette(),
    action_view_zoom_in: () => m.menubar_zoom_in(),
    action_view_zoom_out: () => m.menubar_zoom_out(),
    action_theme_use_system: () => m.menubar_theme_system(),
    action_theme_use_light: () => m.menubar_theme_light(),
    action_theme_use_dark: () => m.menubar_theme_dark(),
    action_settings_open_global: () => m.menubar_global_settings(),
    action_settings_open_project: () => m.menubar_project_settings(),
    action_settings_open_keymap: () => m.menubar_keymap_settings(),
    action_help_open_documentation: () => m.menubar_documentation(),
    action_help_open_about: () => m.menubar_about(),
};

export const resolveActionLabel = (labelKey: string): string => {
    const direct = messageLookup(labelKey);
    if (direct) {
        return direct();
    }

    const fallback = ACTION_LABEL_FALLBACKS[labelKey];
    if (fallback) {
        return fallback();
    }

    return labelKey
        .replace(/^action_/, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const resolveActionDescription = (descriptionKey: string): string => {
    const direct = messageLookup(descriptionKey);
    return direct ? direct() : "";
};

export const actionNamespace = (actionId: string): string =>
    actionId.split("::")[0] ?? actionId;

/** e.g. `workspace::OpenProject` → `workspace: Open an existing .ergproj archive.` */
export const formatActionCatalogLabel = (
    actionId: string,
    descriptionKey: string,
): string => {
    const namespace = actionNamespace(actionId);
    const description = resolveActionDescription(descriptionKey);
    if (description) {
        return `${namespace}: ${description}`;
    }

    const command = actionId.split("::")[1] ?? actionId;
    const humanized = command.replace(/([a-z])([A-Z])/g, "$1 $2");
    return `${namespace}: ${humanized}`;
};

export const resolveContextLabel = (descriptionKey: string): string => {
    const direct = messageLookup(descriptionKey);
    return direct ? direct() : descriptionKey.replace(/^context_/, "");
};

export const resolveKeymapCategoryLabel = (category: string): string => {
    const key = `settings_keymap_category_${category}`;
    const direct = messageLookup(key);
    return direct ? direct() : category;
};
