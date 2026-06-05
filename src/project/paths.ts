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

export const projectFileNameFromPath = (projectPath: string): string => {
    const segments = projectPath.split(/[/\\]/);
    return segments[segments.length - 1] ?? projectPath;
};

export const projectDirectoryFromPath = (projectPath: string): string => {
    const separator = projectPath.includes("\\") ? "\\" : "/";
    const segments = projectPath.split(/[/\\]/);
    if (segments.length <= 1) {
        return "";
    }
    return segments.slice(0, -1).join(separator);
};

/** Human-readable project title derived from the `.ergproj` file basename. */
export const displayProjectNameFromPath = (projectPath: string): string =>
    projectBaseNameFromPath(projectPath).replace(/_/g, " ");

export type RecentProjectDisplay = {
    projectPath: string;
    projectName: string;
    fileName: string;
    directoryPath: string;
};

export const formatRecentProjectDisplay = (
    projectPath: string,
): RecentProjectDisplay => {
    const fileName = projectFileNameFromPath(projectPath);
    const directoryPath = projectDirectoryFromPath(projectPath);
    return {
        projectPath,
        projectName: displayProjectNameFromPath(projectPath),
        fileName,
        directoryPath,
    };
};

/** Primary/secondary labels for a project path in two-line list pickers. */
export const twoLineLabelsForProjectPath = (
    projectPath: string,
): { primary: string; secondary: string; title: string } => {
    const { projectName, fileName, directoryPath } =
        formatRecentProjectDisplay(projectPath);
    return {
        primary: `${projectName} (${fileName})`,
        secondary: directoryPath || projectPath,
        title: projectPath,
    };
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
