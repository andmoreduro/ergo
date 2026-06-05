import { save } from "@tauri-apps/plugin-dialog";

export const saveBibliographyDialog = async (
    defaultPath = "references.bib",
): Promise<string | null> => {
    const selected = await save({
        defaultPath,
        filters: [{ name: "BibLaTeX", extensions: ["bib"] }],
    });
    return typeof selected === "string" ? selected : null;
};
