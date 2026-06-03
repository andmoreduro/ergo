import { importAssetBytes } from "../../assets/importAsset";
import { defaultFieldIdForElement } from "../../fieldIds";
import { resolveContentInsertAnchor } from "../../insertContext";
import { contentSection } from "../../fieldNavigation";
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

        const figureId = createId();
        const assetId = createId();
        const anchor = resolveContentInsertAnchor(section, ctx.anchorElementId);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { asset } = await importAssetBytes(
            fileNameForPastedImage(file, assetId),
            bytes,
        );

        ctx.dispatch({
            type: "ADD_FIGURE",
            payload: {
                sectionId: anchor.sectionId,
                figureId,
                afterElementId: anchor.afterElementId,
            },
        });

        if (anchor.replaceElementId) {
            ctx.dispatch({
                type: "REMOVE_ELEMENT",
                payload: { elementId: anchor.replaceElementId },
            });
        }

        if (!ctx.ast.assets.some((entry) => entry.id === asset.id)) {
            ctx.dispatch({ type: "ADD_ASSET", payload: { asset } });
        }

        ctx.dispatch({
            type: "UPDATE_FIGURE",
            payload: { figureId, assetId: asset.id },
        });

        ctx.setDocumentFocus({
            elementId: figureId,
            fieldId: defaultFieldIdForElement({ id: figureId, type: "Figure" }),
            caretUtf16Offset: 0,
            sourceRevision: null,
            anchorPageNumber: null,
            forcePreviewScroll: false,
            focusSource: "programmatic",
        });

        return true;
    },
};
