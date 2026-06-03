export const ERGOPROJ_FILE_EXTENSION = ".ergproj";
const ERGOPROJ_EXTENSION = ERGOPROJ_FILE_EXTENSION;
const DEFAULT_PROJECT_FILE_BASENAME = "untitled_document";
const INVALID_FILE_NAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/g;

export const ensureErgprojExtension = (path: string): string =>
    path.toLowerCase().endsWith(ERGOPROJ_EXTENSION)
        ? path
        : `${path}${ERGOPROJ_EXTENSION}`;

const normalizeProjectFileBasename = (value: string): string =>
    value
        .toLocaleLowerCase()
        .replace(INVALID_FILE_NAME_CHARACTERS, " ")
        .trim()
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^[._]+|[._]+$/g, "");

export const projectFileBasenameFromTitle = (title: string): string => {
    const basename = normalizeProjectFileBasename(title);

    return basename || DEFAULT_PROJECT_FILE_BASENAME;
};

export const projectFileNameFromTitle = (title: string): string =>
    ensureErgprojExtension(projectFileBasenameFromTitle(title));

export const stripErgprojExtension = (fileName: string): string =>
    fileName.replace(/\.ergproj$/i, "");

export const projectBaseNameFromPath = (projectPath: string): string => {
    const segments = projectPath.split(/[/\\]/);
    const fileName = segments[segments.length - 1] ?? "";
    return stripErgprojExtension(fileName);
};

const sanitizeExportBaseName = (baseName: string): string =>
    baseName
        .replace(INVALID_FILE_NAME_CHARACTERS, " ")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/^\.+|\.+$/g, "");

/** Default PDF export file name matching the open `.ergproj` basename. */
export const exportPdfFileNameFromProjectPath = (
    projectPath: string | null,
): string => {
    const fallback = `${DEFAULT_PROJECT_FILE_BASENAME}.pdf`;
    if (!projectPath) {
        return fallback;
    }
    const sanitized = sanitizeExportBaseName(projectBaseNameFromPath(projectPath));
    return sanitized ? `${sanitized}.pdf` : fallback;
};

export const sanitizeProjectFileName = (fileName: string): string =>
    ensureErgprojExtension(
        fileName
            .replace(/\.ergproj$/i, "")
            .replace(INVALID_FILE_NAME_CHARACTERS, " ")
            .trim()
            .replace(/\s+/g, " ")
            .replace(/^\.+|\.+$/g, "") || DEFAULT_PROJECT_FILE_BASENAME,
    );

export const projectPathInDirectory = (
    directoryPath: string,
    projectFileName: string,
): string => {
    const separator =
        directoryPath.includes("\\") && !directoryPath.includes("/") ? "\\" : "/";
    const needsSeparator =
        !directoryPath.endsWith("/") && !directoryPath.endsWith("\\");

    return `${directoryPath}${needsSeparator ? separator : ""}${sanitizeProjectFileName(projectFileName)}`;
};
