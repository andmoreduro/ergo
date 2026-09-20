/**
 * Binary framing for several files in one raw IPC body, shared with
 * `src-tauri/src/ipc.rs`:
 *
 *     u32 count, then per file: u32 path length, path (UTF-8), u32 byte length, bytes
 *
 * All integers little-endian. Decoding returns views into the received buffer
 * (no copy); encoding produces one contiguous buffer to send as a raw body.
 */

export interface BundledFile {
    path: string;
    bytes: Uint8Array;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const encodeFileBundle = (files: readonly BundledFile[]): Uint8Array => {
    const paths = files.map((file) => textEncoder.encode(file.path));
    let size = 4;
    for (let index = 0; index < files.length; index += 1) {
        size += 8 + paths[index].length + files[index].bytes.length;
    }
    const out = new Uint8Array(size);
    const view = new DataView(out.buffer);
    let offset = 0;
    view.setUint32(offset, files.length, true);
    offset += 4;
    for (let index = 0; index < files.length; index += 1) {
        const path = paths[index];
        const bytes = files[index].bytes;
        view.setUint32(offset, path.length, true);
        offset += 4;
        out.set(path, offset);
        offset += path.length;
        view.setUint32(offset, bytes.length, true);
        offset += 4;
        out.set(bytes, offset);
        offset += bytes.length;
    }
    return out;
};

export const decodeFileBundle = (buffer: ArrayBuffer): BundledFile[] => {
    const view = new DataView(buffer);
    let offset = 0;
    const readU32 = (): number => {
        if (offset + 4 > buffer.byteLength) {
            throw new Error("Truncated file bundle");
        }
        const value = view.getUint32(offset, true);
        offset += 4;
        return value;
    };
    const readBytes = (length: number): Uint8Array => {
        if (offset + length > buffer.byteLength) {
            throw new Error("Truncated file bundle");
        }
        const bytes = new Uint8Array(buffer, offset, length);
        offset += length;
        return bytes;
    };

    const count = readU32();
    const files: BundledFile[] = [];
    for (let index = 0; index < count; index += 1) {
        const path = textDecoder.decode(readBytes(readU32()));
        const bytes = readBytes(readU32());
        files.push({ path, bytes });
    }
    return files;
};
