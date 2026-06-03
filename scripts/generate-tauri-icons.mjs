import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceSvg = join(root, "public", "app_logo.svg");
const squarePng = join(root, "src-tauri", "app-icon.png");

await sharp(sourceSvg)
    .resize(1024, 1024, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(squarePng);

execFileSync("pnpm", ["tauri", "icon", "src-tauri/app-icon.png"], {
    cwd: root,
    stdio: "inherit",
});
