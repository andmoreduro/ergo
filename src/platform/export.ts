import { save } from "@tauri-apps/plugin-dialog";
import type { ExportFormat } from "../bindings/ExportFormat";

const exportFilters: Record<ExportFormat, { name: string; extensions: string[] }> = {
    pdf: { name: "PDF", extensions: ["pdf"] },
    png: { name: "PNG", extensions: ["png"] },
    svg: { name: "SVG", extensions: ["svg"] },
};

const zipFilter = { name: "ZIP archive", extensions: ["zip"] };

const defaultExportName: Record<ExportFormat, string> = {
    pdf: "document.pdf",
    png: "page-1.png",
    svg: "page-1.svg",
};

export const pageExportFileName = (
    format: "png" | "svg",
    pageNumber: number,
): string => `page-${pageNumber}.${format}`;

export const saveExportDialog = async (
    format: ExportFormat,
    pageCount = 1,
): Promise<string | null> => {
    if (format === "pdf" || pageCount <= 1) {
        const selected = await save({
            defaultPath: defaultExportName[format],
            filters: [exportFilters[format]],
        });
        return typeof selected === "string" ? selected : null;
    }

    const selected = await save({
        defaultPath: `document-pages.zip`,
        filters: [zipFilter],
    });
    return typeof selected === "string" ? selected : null;
};
