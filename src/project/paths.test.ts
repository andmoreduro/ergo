import { describe, expect, it } from "vitest";
import {
    ensureErgprojExtension,
    exportPdfFileNameFromProjectPath,
    formatRecentProjectDisplay,
    twoLineLabelsForProjectPath,
    projectFileBasenameFromTitle,
    projectFileNameFromTitle,
    projectPathInDirectory,
    sanitizeProjectFileName,
    stripErgprojExtension,
} from "./paths";

describe("project path helpers", () => {
    it("adds the .ergproj extension when missing", () => {
        expect(ensureErgprojExtension("paper")).toBe("paper.ergproj");
        expect(ensureErgprojExtension("paper.ERGPROJ")).toBe("paper.ERGPROJ");
    });

    it("generates lowercase snake case while preserving Spanish characters", () => {
        expect(projectFileBasenameFromTitle("Taller: regresión con ñ")).toBe(
            "taller_regresión_con_ñ",
        );
        expect(projectFileNameFromTitle("Taller: regresión con ñ")).toBe(
            "taller_regresión_con_ñ.ergproj",
        );
    });

    it("strips a pasted .ergproj extension from the editable basename", () => {
        expect(stripErgprojExtension("paper.ergproj")).toBe("paper");
        expect(stripErgprojExtension("paper.ERGPROJ")).toBe("paper");
    });

    it("sanitizes edited project file names before saving", () => {
        expect(sanitizeProjectFileName("Mi Archivo: Final")).toBe(
            "Mi Archivo Final.ergproj",
        );
    });

    it("creates a default project path inside a selected Windows folder", () => {
        expect(
            projectPathInDirectory(
                "C:\\Users\\ada\\Documents",
                "untitled_document.ergproj",
            ),
        ).toBe("C:\\Users\\ada\\Documents\\untitled_document.ergproj");
    });

    it("creates a default project path inside a selected POSIX folder", () => {
        expect(projectPathInDirectory("/home/ada/docs/", "paper_draft")).toBe(
            "/home/ada/docs/paper_draft.ergproj",
        );
    });

    it("derives the PDF export name from the project file path", () => {
        expect(
            exportPdfFileNameFromProjectPath(
                "C:\\Users\\ada\\Documents\\Mi Tesis.ergproj",
            ),
        ).toBe("Mi Tesis.pdf");
        expect(exportPdfFileNameFromProjectPath(null)).toBe(
            "untitled_document.pdf",
        );
    });

    it("formats recent project display labels from a path", () => {
        expect(
            formatRecentProjectDisplay(
                "C:\\Users\\ada\\Documents\\mi_tesis.ergproj",
            ),
        ).toEqual({
            projectPath: "C:\\Users\\ada\\Documents\\mi_tesis.ergproj",
            projectName: "mi tesis",
            fileName: "mi_tesis.ergproj",
            directoryPath: "C:\\Users\\ada\\Documents",
        });
    });

    it("builds two-line list picker labels from a project path", () => {
        expect(
            twoLineLabelsForProjectPath(
                "C:\\Users\\ada\\Documents\\mi_tesis.ergproj",
            ),
        ).toEqual({
            primary: "mi tesis (mi_tesis.ergproj)",
            secondary: "C:\\Users\\ada\\Documents",
            title: "C:\\Users\\ada\\Documents\\mi_tesis.ergproj",
        });
    });
});
