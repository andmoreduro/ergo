import type { ImgHTMLAttributes } from "react";
import { APP_LOGO_SRC } from "../../../theme/resolvedColorScheme";
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
    return (
        <img
            className={`${styles.logo} ${className}`.trim()}
            src={APP_LOGO_SRC}
            alt={alt}
            {...rest}
        />
    );
};
