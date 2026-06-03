export type ResolvedColorScheme = "light" | "dark";

export const readResolvedColorScheme = (): ResolvedColorScheme => {
    const theme = document.documentElement.dataset.theme;
    if (theme === "dark") {
        return "dark";
    }
    if (theme === "light") {
        return "light";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
};

export const APP_LOGO_SRC = "/app_logo.svg";
