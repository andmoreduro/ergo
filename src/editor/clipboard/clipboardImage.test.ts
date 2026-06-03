import { describe, expect, it } from "vitest";
import {
    extensionForImageMime,
    extensionForPastedImage,
    fileNameForPastedImage,
    readClipboardImageFile,
} from "./clipboardImage";

describe("clipboardImage", () => {
    it("maps common image MIME types to extensions", () => {
        expect(extensionForImageMime("image/png")).toBe("png");
        expect(extensionForImageMime("image/jpeg")).toBe("jpg");
        expect(extensionForImageMime("image/unknown")).toBeNull();
    });

    it("names pasted images image-<assetId>.<ext>", () => {
        const file = new File([new Uint8Array([1])], "", { type: "image/png" });
        expect(fileNameForPastedImage(file, "550e8400-e29b-41d4-a716-446655440000")).toBe(
            "image-550e8400-e29b-41d4-a716-446655440000.png",
        );
    });

    it("derives extension from the clipboard file name when MIME is unknown", () => {
        const file = new File([new Uint8Array([1])], "photo.webp", {
            type: "image/unknown",
        });
        expect(extensionForPastedImage(file)).toBe("webp");
    });

    it("reads the first image file from clipboard items", () => {
        const file = new File([new Uint8Array([1])], "shot.png", { type: "image/png" });
        const data = {
            items: [
                { kind: "string", type: "text/plain" },
                {
                    kind: "file",
                    type: "image/png",
                    getAsFile: () => file,
                },
            ],
        } as unknown as DataTransfer;

        expect(readClipboardImageFile(data)).toBe(file);
    });
});
