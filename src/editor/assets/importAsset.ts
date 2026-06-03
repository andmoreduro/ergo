import { TauriApi } from "../../api/tauri";
import type { AssetEntry } from "../../bindings/AssetEntry";
import { CompilerClient } from "../../workers/compilerClient";

export type ImportedAsset = {
    asset: AssetEntry;
    bytes: Uint8Array;
};

/** Copy bytes into the project VFS under `assets/` and mirror them in the WASM compiler. */
export const importAssetBytes = async (
    fileName: string,
    bytes: Uint8Array,
): Promise<ImportedAsset> => {
    const result = await TauriApi.importResourceBytes(fileName, bytes);
    const normalized = new Uint8Array(result.bytes);
    await CompilerClient.writeFile(result.asset.path, normalized);
    return { asset: result.asset, bytes: normalized };
};
