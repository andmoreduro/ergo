const ERGOPROJ_EXTENSION = ".ergproj";
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

export const projectFileNameFromTitle = (title: string): string => {
    const basename = normalizeProjectFileBasename(title);

    return ensureErgprojExtension(basename || DEFAULT_PROJECT_FILE_BASENAME);
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
