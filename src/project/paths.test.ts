import { describe, expect, it } from "vitest";
import {
    ensureErgprojExtension,
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
});
