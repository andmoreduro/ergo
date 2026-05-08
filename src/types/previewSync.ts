import type { SourceRevision } from "./compilation";

export interface PreviewPageMetrics {
    pageNumber: number;
    widthPt: number;
    heightPt: number;
}

export interface PreviewElementPosition {
    elementId: string | null;
    fieldId: string | null;
    caretUtf16Offset: number | null;
    pageNumber: number;
    xPt: number;
    yPt: number;
    sourceRevision: SourceRevision;
}

export interface PreviewFocusTarget {
    elementId: string;
    fieldId: string | null;
    caretUtf16Offset: number | null;
    sourceRevision: SourceRevision;
}

export interface PreviewSyncStatus {
    sourceRevision: SourceRevision | null;
    pages: PreviewPageMetrics[];
}

export type PreviewJumpResult =
    | {
          status: "field";
          target: PreviewFocusTarget;
          sourceRevision: SourceRevision;
      }
    | {
          status: "element";
          elementId: string;
          sourceRevision: SourceRevision;
      }
    | {
          status: "position";
          position: PreviewElementPosition;
          sourceRevision: SourceRevision;
      }
    | {
          status: "noMatch";
          sourceRevision: SourceRevision | null;
          reason: string;
      }
    | {
          status: "unavailable";
          sourceRevision: SourceRevision | null;
          reason: string;
      };

export type PreviewElementPositionsResult =
    | {
          status: "matched";
          positions: PreviewElementPosition[];
          sourceRevision: SourceRevision;
      }
    | {
          status: "noMatch";
          sourceRevision: SourceRevision | null;
          reason: string;
      }
    | {
          status: "unavailable";
          sourceRevision: SourceRevision | null;
          reason: string;
      };
