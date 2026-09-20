import { describe, expect, it } from "vitest";
import { decodeFileBundle, encodeFileBundle } from "./fileBundle";

describe("file bundle framing", () => {
    it("round-trips paths (including non-ASCII) and bytes without copying on decode", () => {
        const files = [
            { path: "assets/ñandú.png", bytes: new Uint8Array([0, 255, 1, 2]) },
            { path: "empty", bytes: new Uint8Array() },
        ];
        const encoded = encodeFileBundle(files);
        const decoded = decodeFileBundle(encoded.buffer as ArrayBuffer);

        expect(decoded.map((file) => file.path)).toEqual(["assets/ñandú.png", "empty"]);
        expect(Array.from(decoded[0].bytes)).toEqual([0, 255, 1, 2]);
        expect(decoded[1].bytes.length).toBe(0);
        expect(decoded[0].bytes.buffer).toBe(encoded.buffer);
    });

    it("rejects a truncated bundle and accepts an empty one", () => {
        const encoded = encodeFileBundle([{ path: "a", bytes: new Uint8Array([1, 2, 3]) }]);
        expect(() =>
            decodeFileBundle(encoded.buffer.slice(0, encoded.byteLength - 1) as ArrayBuffer),
        ).toThrow(/Truncated/);
        expect(decodeFileBundle(encodeFileBundle([]).buffer as ArrayBuffer)).toEqual([]);
    });
});
