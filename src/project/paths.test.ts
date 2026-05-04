import { describe, expect, it } from "vitest";
import {
    ensureErgprojExtension,
    projectFileNameFromTitle,
    projectPathInDirectory,
    sanitizeProjectFileName,
} from "./paths";

describe("project path helpers", () => {
    it("adds the .ergproj extension when missing", () => {
        expect(ensureErgprojExtension("paper")).toBe("paper.ergproj");
        expect(ensureErgprojExtension("paper.ERGPROJ")).toBe("paper.ERGPROJ");
    });

    it("generates lowercase snake case while preserving Spanish characters", () => {
        expect(projectFileNameFromTitle("Taller: regresión con ñ")).toBe(
            "taller_regresión_con_ñ.ergproj",
        );
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
