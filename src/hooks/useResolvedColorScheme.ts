import { useSyncExternalStore } from "react";
import {
    ergoThemeLogoSrc,
    readResolvedColorScheme,
    type ResolvedColorScheme,
} from "../theme/resolvedColorScheme";

const subscribeResolvedColorScheme = (onStoreChange: () => void): (() => void) => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const observer = new MutationObserver(onStoreChange);
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
    });
    media.addEventListener("change", onStoreChange);
    return () => {
        observer.disconnect();
        media.removeEventListener("change", onStoreChange);
    };
};

export const useResolvedColorScheme = (): ResolvedColorScheme =>
    useSyncExternalStore(
        subscribeResolvedColorScheme,
        readResolvedColorScheme,
        () => "light",
    );

export const useErgoThemeLogoSrc = (): string =>
    ergoThemeLogoSrc(useResolvedColorScheme());
