import type { ImgHTMLAttributes } from "react";
import { useErgoThemeLogoSrc } from "../../../hooks/useResolvedColorScheme";
import styles from "./ErgoThemeLogo.module.css";

export type ErgoThemeLogoProps = Omit<
    ImgHTMLAttributes<HTMLImageElement>,
    "src"
>;

export const ErgoThemeLogo = ({
    className = "",
    alt,
    ...rest
}: ErgoThemeLogoProps) => {
    const src = useErgoThemeLogoSrc();

    return (
        <img
            className={`${styles.logo} ${className}`.trim()}
            src={src}
            alt={alt}
            {...rest}
        />
    );
};
