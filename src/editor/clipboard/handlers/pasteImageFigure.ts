import { importAssetBytes } from "../../assets/importAsset";
import { resolveContentInsertAnchor } from "../../insertContext";
import { contentSection } from "../../fieldNavigation";
import { insertFigureWithAsset } from "../../insertFigureWithAsset";
import { createId } from "../../../state/ast/defaults";
import { fileNameForPastedImage, readClipboardImageFile } from "../clipboardImage";
import type { ClipboardPasteContext, ClipboardPasteHandler } from "../types";

const pastedImageBehavior = (ctx: ClipboardPasteContext): string | null =>
    ctx.templateSpec?.typst.resources?.pasted_image?.behavior ?? "figure";

export const pasteImageFigureHandler: ClipboardPasteHandler = {
    priority: 10,
    canHandle: (data) => readClipboardImageFile(data) !== null,
    handle: async (ctx, data) => {
        if (pastedImageBehavior(ctx) !== "figure") {
            return false;
        }

        const file = readClipboardImageFile(data);
        if (!file) {
            return false;
        }

        const section = contentSection(ctx.ast);
        if (!section) {
            return false;
        }

        const assetId = createId();
        const anchor = resolveContentInsertAnchor(section, ctx.anchorElementId);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { asset } = await importAssetBytes(
            fileNameForPastedImage(file, assetId),
            bytes,
        );

        if (!ctx.ast.assets.some((entry) => entry.id === asset.id)) {
            ctx.dispatch({ type: "ADD_ASSET", payload: { asset } });
        }

        return insertFigureWithAsset(
            ctx.ast,
            asset.id,
            ctx.dispatch,
            ctx.setDocumentFocus,
            anchor.afterElementId ?? ctx.anchorElementId,
        );
    },
};
