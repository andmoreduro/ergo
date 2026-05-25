import type { DocumentAST } from "../../bindings/DocumentAST";
import type { ProjectSettings } from "../../bindings/ProjectSettings";
import type { ReferenceEntry } from "../../bindings/ReferenceEntry";
import type { AssetEntry } from "../../bindings/AssetEntry";
import type { ProjectFile } from "../../bindings/ProjectFile";

export type LoadDocumentAction = {
  type: 'LOAD_DOCUMENT';
  payload: {
    ast: DocumentAST;
    projectFiles?: ProjectFile[];
  };
};

export type UpdateProjectTitleAction = {
  type: 'UPDATE_PROJECT_TITLE';
  payload: {
    title: string;
  };
};

export type UpdateProjectSettingsAction = {
  type: 'UPDATE_PROJECT_SETTINGS';
  payload: {
    settings: ProjectSettings;
  };
};

export type UpdateTemplateVariantAction = {
  type: 'UPDATE_TEMPLATE_VARIANT';
  payload: {
    variantId: string;
  };
};

export type UpdateInputAction = {
  type: 'UPDATE_INPUT';
  payload: {
    path: string;
    value: any;
  };
};

export type InsertInputArrayItemAction = {
  type: 'INSERT_INPUT_ARRAY_ITEM';
  payload: {
    path: string;
    index: number;
    value: any;
  };
};

export type RemoveInputArrayItemAction = {
  type: 'REMOVE_INPUT_ARRAY_ITEM';
  payload: {
    path: string;
    index: number;
  };
};

export type UpdateCustomElementFieldAction = {
  type: 'UPDATE_CUSTOM_ELEMENT_FIELD';
  payload: {
    elementId: string;
    field: string;
    value: any;
  };
};

export type AddParagraphAction = {
  type: 'ADD_PARAGRAPH';
  payload: {
    sectionId: string;
    paragraphId: string;
    afterElementId?: string;
  };
};

export type AddHeadingAction = {
  type: 'ADD_HEADING';
  payload: {
    sectionId: string;
    headingId: string;
    level?: number;
    afterElementId?: string;
  };
};

export type AddTableAction = {
  type: 'ADD_TABLE';
  payload: {
    sectionId: string;
    tableId: string;
    afterElementId?: string;
  };
};

export type AddEquationAction = {
  type: 'ADD_EQUATION';
  payload: {
    sectionId: string;
    equationId: string;
    afterElementId?: string;
  };
};

export type AddFigureAction = {
  type: 'ADD_FIGURE';
  payload: {
    sectionId: string;
    figureId: string;
    afterElementId?: string;
  };
};

export type UpdateParagraphTextAction = {
  type: 'UPDATE_PARAGRAPH_TEXT';
  payload: {
    paragraphId: string;
    text: string;
  };
};

export type UpdateParagraphContentAction = {
  type: 'UPDATE_PARAGRAPH_CONTENT';
  payload: {
    paragraphId: string;
    content: import('../../bindings/RichText').RichText[];
  };
};

export type UpdateHeadingAction = {
  type: 'UPDATE_HEADING';
  payload: {
    headingId: string;
    text?: string;
    level?: number;
  };
};

export type UpdateHeadingContentAction = {
  type: 'UPDATE_HEADING_CONTENT';
  payload: {
    headingId: string;
    content: import('../../bindings/RichText').RichText[];
    level?: number;
  };
};

export type UpdateEquationAction = {
  type: 'UPDATE_EQUATION';
  payload: {
    equationId: string;
    latexSource?: string;
    isBlock?: boolean;
  };
};

export type UpdateTableCellAction = {
  type: 'UPDATE_TABLE_CELL';
  payload: {
    tableId: string;
    rowIndex: number;
    colIndex: number;
    text: string;
  };
};

export type AddTableRowAction = {
  type: 'ADD_TABLE_ROW';
  payload: {
    tableId: string;
  };
};

export type RemoveTableRowAction = {
  type: 'REMOVE_TABLE_ROW';
  payload: {
    tableId: string;
    rowIndex: number;
  };
};

export type AddTableColumnAction = {
  type: 'ADD_TABLE_COLUMN';
  payload: {
    tableId: string;
  };
};

export type RemoveTableColumnAction = {
  type: 'REMOVE_TABLE_COLUMN';
  payload: {
    tableId: string;
    colIndex: number;
  };
};

export type UpdateTableColumnSizeAction = {
  type: 'UPDATE_TABLE_COLUMN_SIZE';
  payload: {
    tableId: string;
    colIndex: number;
    size: string;
  };
};

export type UpdateFigureAction = {
  type: 'UPDATE_FIGURE';
  payload: {
    figureId: string;
    caption?: string;
    placement?: string;
    bodyText?: string;
    assetId?: string;
  };
};

export type UpdateElementExtraFieldAction = {
  type: 'UPDATE_ELEMENT_EXTRA_FIELD';
  payload: {
    elementId: string;
    fieldKey: string;
    fieldValue: string;
  };
};

export type AddReferenceAction = {
  type: 'ADD_REFERENCE';
  payload: {
    reference: ReferenceEntry;
  };
};

export type UpdateReferenceAction = {
  type: 'UPDATE_REFERENCE';
  payload: {
    reference: ReferenceEntry;
  };
};

export type RemoveReferenceAction = {
  type: 'REMOVE_REFERENCE';
  payload: {
    referenceId: string;
  };
};

export type AddAssetAction = {
  type: 'ADD_ASSET';
  payload: {
    asset: AssetEntry;
  };
};

export type UpdateAssetAction = {
  type: 'UPDATE_ASSET';
  payload: {
    asset: AssetEntry;
  };
};

export type RemoveAssetAction = {
  type: 'REMOVE_ASSET';
  payload: {
    assetId: string;
  };
};

export type RemoveElementAction = {
  type: 'REMOVE_ELEMENT';
  payload: {
    elementId: string;
  };
};

export type ASTAction =
  | LoadDocumentAction
  | UpdateProjectTitleAction
  | UpdateProjectSettingsAction
  | UpdateTemplateVariantAction
  | UpdateInputAction
  | InsertInputArrayItemAction
  | RemoveInputArrayItemAction
  | UpdateCustomElementFieldAction
  | AddParagraphAction
  | AddHeadingAction
  | AddTableAction
  | AddEquationAction
  | AddFigureAction
  | UpdateParagraphTextAction
  | UpdateParagraphContentAction
  | UpdateHeadingAction
  | UpdateHeadingContentAction
  | UpdateEquationAction
  | UpdateTableCellAction
  | AddTableRowAction
  | RemoveTableRowAction
  | AddTableColumnAction
  | RemoveTableColumnAction
  | UpdateTableColumnSizeAction
  | UpdateFigureAction
  | UpdateElementExtraFieldAction
  | AddReferenceAction
  | UpdateReferenceAction
  | RemoveReferenceAction
  | AddAssetAction
  | UpdateAssetAction
  | RemoveAssetAction
  | RemoveElementAction;
