import type { DocumentAST } from "../../bindings/DocumentAST";
import type { ProjectSettings } from "../../bindings/ProjectSettings";

export type LoadDocumentAction = {
  type: 'LOAD_DOCUMENT';
  payload: {
    ast: DocumentAST;
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

export type UpdateCoverPageAbstractAction = {
  type: 'UPDATE_COVER_PAGE_ABSTRACT';
  payload: {
    sectionId: string;
    abstractText: string;
  };
};

export type UpdateCoverPageAffiliationsAction = {
  type: 'UPDATE_COVER_PAGE_AFFILIATIONS';
  payload: {
    sectionId: string;
    affiliations: string[];
  };
};

export type AddAuthorAction = {
  type: 'ADD_AUTHOR';
  payload: {
    sectionId: string;
  };
};

export type UpdateAuthorAction = {
  type: 'UPDATE_AUTHOR';
  payload: {
    sectionId: string;
    authorIndex: number;
    field: 'name' | 'email';
    value: string;
  };
};

export type RemoveAuthorAction = {
  type: 'REMOVE_AUTHOR';
  payload: {
    sectionId: string;
    authorIndex: number;
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

export type UpdateHeadingAction = {
  type: 'UPDATE_HEADING';
  payload: {
    headingId: string;
    text?: string;
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
  | UpdateCoverPageAbstractAction
  | UpdateCoverPageAffiliationsAction
  | AddAuthorAction
  | UpdateAuthorAction
  | RemoveAuthorAction
  | AddParagraphAction
  | AddHeadingAction
  | AddTableAction
  | AddEquationAction
  | AddFigureAction
  | UpdateParagraphTextAction
  | UpdateHeadingAction
  | UpdateEquationAction
  | UpdateTableCellAction
  | AddTableRowAction
  | RemoveTableRowAction
  | AddTableColumnAction
  | RemoveTableColumnAction
  | UpdateTableColumnSizeAction
  | UpdateFigureAction
  | RemoveElementAction;
