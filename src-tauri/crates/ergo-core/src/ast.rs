use serde::{Deserialize, Serialize};
use std::{fmt, str::FromStr};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DocumentAST {
    pub version: String,
    pub metadata: ProjectMetadata,
    pub dependencies: DependencyManifest,
    #[serde(default)]
    pub references: Vec<ReferenceEntry>,
    #[serde(default)]
    pub assets: Vec<AssetEntry>,
    pub sections: Vec<DocumentSection>,
    #[serde(default)]
    #[ts(type = "Record<string, any>")]
    pub inputs: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ProjectMetadata {
    pub template_id: String,
    #[serde(default)]
    pub template_variant_id: Option<String>,
    pub title: String,
    #[serde(default)]
    pub project_settings: ProjectSettings,
    pub local_overrides: GlobalSettings,
    #[serde(default)]
    pub running_head: Option<String>,
    #[serde(default)]
    pub keywords: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct GlobalSettings {
    pub default_font: Option<String>,
    pub default_font_size: Option<f32>,
    #[serde(default)]
    pub theme_mode: Option<String>,
    #[serde(default)]
    pub locale: Option<String>,
    #[serde(default)]
    pub recent_projects: Vec<String>,
    #[serde(default)]
    pub keymap_profile: Option<String>,
    #[serde(default)]
    pub keymap_overrides: Vec<KeyBindingPreference>,
    #[serde(default)]
    pub history_limit: Option<usize>,
    #[serde(default)]
    pub autosave_enabled: Option<bool>,
    #[serde(default)]
    pub autosave_interval_ms: Option<usize>,
    #[serde(default)]
    pub autosave_on_window_blur: Option<bool>,
    #[serde(default)]
    pub autosave_on_app_close: Option<bool>,
    #[serde(default)]
    pub autosave_on_project_close: Option<bool>,
}

impl Default for GlobalSettings {
    fn default() -> Self {
        Self {
            default_font: None,
            default_font_size: None,
            theme_mode: Some("system".to_string()),
            locale: Some("en".to_string()),
            recent_projects: Vec::new(),
            keymap_profile: Some("Default".to_string()),
            keymap_overrides: Vec::new(),
            history_limit: Some(100),
            autosave_enabled: Some(true),
            autosave_interval_ms: Some(30_000),
            autosave_on_window_blur: Some(true),
            autosave_on_app_close: Some(true),
            autosave_on_project_close: Some(true),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ProjectSettings {
    #[serde(default)]
    pub paper_size: Option<String>,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub text_font: Option<String>,
    #[serde(default)]
    pub math_font: Option<String>,
    #[serde(default)]
    pub raw_font: Option<String>,
    #[serde(default)]
    pub font_size: Option<f32>,
    #[serde(default)]
    pub table_stroke_width: Option<f32>,
    #[serde(default)]
    pub template_overrides: Vec<TemplateOverride>,
}

impl Default for ProjectSettings {
    fn default() -> Self {
        Self {
            paper_size: Some("us-letter".to_string()),
            language: Some("en".to_string()),
            text_font: Some("Libertinus Serif".to_string()),
            math_font: Some("Libertinus Math".to_string()),
            raw_font: Some("DejaVu Sans Mono".to_string()),
            font_size: Some(11.0),
            table_stroke_width: Some(0.5),
            template_overrides: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TemplateOverride {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum ActionId {
    #[serde(rename = "workspace::NewProject")]
    WorkspaceNewProject,
    #[serde(rename = "workspace::OpenProject")]
    WorkspaceOpenProject,
    #[serde(rename = "workspace::OpenRecentProject")]
    WorkspaceOpenRecentProject,
    #[serde(rename = "workspace::SaveProject")]
    WorkspaceSaveProject,
    #[serde(rename = "workspace::CloseProject")]
    WorkspaceCloseProject,
    #[serde(rename = "workspace::ExportSvg")]
    WorkspaceExportSvg,
    #[serde(rename = "edit::Undo")]
    EditUndo,
    #[serde(rename = "edit::Redo")]
    EditRedo,
    #[serde(rename = "editor::DeleteElement")]
    EditorDeleteElement,
    #[serde(rename = "editor::InsertParagraph")]
    EditorInsertParagraph,
    #[serde(rename = "editor::InsertHeading")]
    EditorInsertHeading,
    #[serde(rename = "editor::InsertTable")]
    EditorInsertTable,
    #[serde(rename = "editor::InsertFigure")]
    EditorInsertFigure,
    #[serde(rename = "editor::InsertEquation")]
    EditorInsertEquation,
    #[serde(rename = "editor::InsertBlockEquation")]
    EditorInsertBlockEquation,
    #[serde(rename = "editor::InsertInlineEquation")]
    EditorInsertInlineEquation,
    #[serde(rename = "editor::InsertQuote")]
    EditorInsertQuote,
    #[serde(rename = "editor::InsertDiagram")]
    EditorInsertDiagram,
    #[serde(rename = "editor::InsertList")]
    EditorInsertList,
    #[serde(rename = "editor::InsertEnumeration")]
    EditorInsertEnumeration,
    #[serde(rename = "editor::InsertReference")]
    EditorInsertReference,
    #[serde(rename = "editor::Bold")]
    EditorBold,
    #[serde(rename = "editor::Italic")]
    EditorItalic,
    #[serde(rename = "editor::Underline")]
    EditorUnderline,
    #[serde(rename = "editor::AddAuthor")]
    EditorAddAuthor,
    #[serde(rename = "editor::RemoveAuthor")]
    EditorRemoveAuthor,
    #[serde(rename = "editor::AddTableRow")]
    EditorAddTableRow,
    #[serde(rename = "editor::AddTableColumn")]
    EditorAddTableColumn,
    #[serde(rename = "editor::RemoveTableRow")]
    EditorRemoveTableRow,
    #[serde(rename = "editor::RemoveTableColumn")]
    EditorRemoveTableColumn,
    #[serde(rename = "editor::ConvertToParagraph")]
    EditorConvertToParagraph,
    #[serde(rename = "editor::ConvertToHeading")]
    EditorConvertToHeading,
    #[serde(rename = "editor::ConvertToTable")]
    EditorConvertToTable,
    #[serde(rename = "editor::ConvertToEquation")]
    EditorConvertToEquation,
    #[serde(rename = "editor::ConvertToFigure")]
    EditorConvertToFigure,
    #[serde(rename = "editor::FocusField")]
    EditorFocusField,
    #[serde(rename = "editor::MoveTableCellLeft")]
    EditorMoveTableCellLeft,
    #[serde(rename = "editor::MoveTableCellRight")]
    EditorMoveTableCellRight,
    #[serde(rename = "editor::MoveTableCellUp")]
    EditorMoveTableCellUp,
    #[serde(rename = "editor::MoveTableCellDown")]
    EditorMoveTableCellDown,
    #[serde(rename = "editor::EnterTable")]
    EditorEnterTable,
    #[serde(rename = "editor::BodyNavigateLeft")]
    EditorBodyNavigateLeft,
    #[serde(rename = "editor::BodyNavigateRight")]
    EditorBodyNavigateRight,
    #[serde(rename = "editor::BodyNavigateUp")]
    EditorBodyNavigateUp,
    #[serde(rename = "editor::BodyNavigateDown")]
    EditorBodyNavigateDown,
    #[serde(rename = "bibliography::CreateEntry")]
    BibliographyCreateEntry,
    #[serde(rename = "bibliography::OpenEntry")]
    BibliographyOpenEntry,
    #[serde(rename = "bibliography::SaveEntry")]
    BibliographySaveEntry,
    #[serde(rename = "bibliography::RemoveEntry")]
    BibliographyRemoveEntry,
    #[serde(rename = "bibliography::CancelEdit")]
    BibliographyCancelEdit,
    #[serde(rename = "resources::Create")]
    ResourcesCreate,
    #[serde(rename = "resources::Open")]
    ResourcesOpen,
    #[serde(rename = "resources::Edit")]
    ResourcesEdit,
    #[serde(rename = "resources::Save")]
    ResourcesSave,
    #[serde(rename = "resources::Remove")]
    ResourcesRemove,
    #[serde(rename = "resources::InsertReference")]
    ResourcesInsertReference,
    #[serde(rename = "view::OpenCommandPalette")]
    ViewOpenCommandPalette,
    #[serde(rename = "view::ZoomIn")]
    ViewZoomIn,
    #[serde(rename = "view::ZoomOut")]
    ViewZoomOut,
    #[serde(rename = "theme::UseSystem")]
    ThemeUseSystem,
    #[serde(rename = "theme::UseLight")]
    ThemeUseLight,
    #[serde(rename = "theme::UseDark")]
    ThemeUseDark,
    #[serde(rename = "settings::OpenGlobal")]
    SettingsOpenGlobal,
    #[serde(rename = "settings::OpenProject")]
    SettingsOpenProject,
    #[serde(rename = "settings::OpenKeymap")]
    SettingsOpenKeymap,
    #[serde(rename = "settings::Close")]
    SettingsClose,
    #[serde(rename = "help::OpenDocumentation")]
    HelpOpenDocumentation,
    #[serde(rename = "help::OpenAbout")]
    HelpOpenAbout,
}

impl ActionId {
    pub fn as_str(self) -> &'static str {
        match self {
            ActionId::WorkspaceNewProject => "workspace::NewProject",
            ActionId::WorkspaceOpenProject => "workspace::OpenProject",
            ActionId::WorkspaceOpenRecentProject => "workspace::OpenRecentProject",
            ActionId::WorkspaceSaveProject => "workspace::SaveProject",
            ActionId::WorkspaceCloseProject => "workspace::CloseProject",
            ActionId::WorkspaceExportSvg => "workspace::ExportSvg",
            ActionId::EditUndo => "edit::Undo",
            ActionId::EditRedo => "edit::Redo",
            ActionId::EditorDeleteElement => "editor::DeleteElement",
            ActionId::EditorInsertParagraph => "editor::InsertParagraph",
            ActionId::EditorInsertHeading => "editor::InsertHeading",
            ActionId::EditorInsertTable => "editor::InsertTable",
            ActionId::EditorInsertFigure => "editor::InsertFigure",
            ActionId::EditorInsertEquation => "editor::InsertEquation",
            ActionId::EditorInsertBlockEquation => "editor::InsertBlockEquation",
            ActionId::EditorInsertInlineEquation => "editor::InsertInlineEquation",
            ActionId::EditorInsertQuote => "editor::InsertQuote",
            ActionId::EditorInsertDiagram => "editor::InsertDiagram",
            ActionId::EditorInsertList => "editor::InsertList",
            ActionId::EditorInsertEnumeration => "editor::InsertEnumeration",
            ActionId::EditorInsertReference => "editor::InsertReference",
            ActionId::EditorBold => "editor::Bold",
            ActionId::EditorItalic => "editor::Italic",
            ActionId::EditorUnderline => "editor::Underline",
            ActionId::EditorAddAuthor => "editor::AddAuthor",
            ActionId::EditorRemoveAuthor => "editor::RemoveAuthor",
            ActionId::EditorAddTableRow => "editor::AddTableRow",
            ActionId::EditorAddTableColumn => "editor::AddTableColumn",
            ActionId::EditorRemoveTableRow => "editor::RemoveTableRow",
            ActionId::EditorRemoveTableColumn => "editor::RemoveTableColumn",
            ActionId::EditorConvertToParagraph => "editor::ConvertToParagraph",
            ActionId::EditorConvertToHeading => "editor::ConvertToHeading",
            ActionId::EditorConvertToTable => "editor::ConvertToTable",
            ActionId::EditorConvertToEquation => "editor::ConvertToEquation",
            ActionId::EditorConvertToFigure => "editor::ConvertToFigure",
            ActionId::EditorFocusField => "editor::FocusField",
            ActionId::EditorMoveTableCellLeft => "editor::MoveTableCellLeft",
            ActionId::EditorMoveTableCellRight => "editor::MoveTableCellRight",
            ActionId::EditorMoveTableCellUp => "editor::MoveTableCellUp",
            ActionId::EditorMoveTableCellDown => "editor::MoveTableCellDown",
            ActionId::EditorEnterTable => "editor::EnterTable",
            ActionId::EditorBodyNavigateLeft => "editor::BodyNavigateLeft",
            ActionId::EditorBodyNavigateRight => "editor::BodyNavigateRight",
            ActionId::EditorBodyNavigateUp => "editor::BodyNavigateUp",
            ActionId::EditorBodyNavigateDown => "editor::BodyNavigateDown",
            ActionId::BibliographyCreateEntry => "bibliography::CreateEntry",
            ActionId::BibliographyOpenEntry => "bibliography::OpenEntry",
            ActionId::BibliographySaveEntry => "bibliography::SaveEntry",
            ActionId::BibliographyRemoveEntry => "bibliography::RemoveEntry",
            ActionId::BibliographyCancelEdit => "bibliography::CancelEdit",
            ActionId::ResourcesCreate => "resources::Create",
            ActionId::ResourcesOpen => "resources::Open",
            ActionId::ResourcesEdit => "resources::Edit",
            ActionId::ResourcesSave => "resources::Save",
            ActionId::ResourcesRemove => "resources::Remove",
            ActionId::ResourcesInsertReference => "resources::InsertReference",
            ActionId::ViewOpenCommandPalette => "view::OpenCommandPalette",
            ActionId::ViewZoomIn => "view::ZoomIn",
            ActionId::ViewZoomOut => "view::ZoomOut",
            ActionId::ThemeUseSystem => "theme::UseSystem",
            ActionId::ThemeUseLight => "theme::UseLight",
            ActionId::ThemeUseDark => "theme::UseDark",
            ActionId::SettingsOpenGlobal => "settings::OpenGlobal",
            ActionId::SettingsOpenProject => "settings::OpenProject",
            ActionId::SettingsOpenKeymap => "settings::OpenKeymap",
            ActionId::SettingsClose => "settings::Close",
            ActionId::HelpOpenDocumentation => "help::OpenDocumentation",
            ActionId::HelpOpenAbout => "help::OpenAbout",
        }
    }
}

impl fmt::Display for ActionId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for ActionId {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "workspace::NewProject" => Ok(ActionId::WorkspaceNewProject),
            "workspace::OpenProject" => Ok(ActionId::WorkspaceOpenProject),
            "workspace::OpenRecentProject" => Ok(ActionId::WorkspaceOpenRecentProject),
            "workspace::SaveProject" => Ok(ActionId::WorkspaceSaveProject),
            "workspace::CloseProject" => Ok(ActionId::WorkspaceCloseProject),
            "workspace::ExportSvg" => Ok(ActionId::WorkspaceExportSvg),
            "edit::Undo" => Ok(ActionId::EditUndo),
            "edit::Redo" => Ok(ActionId::EditRedo),
            "editor::DeleteElement" => Ok(ActionId::EditorDeleteElement),
            "editor::InsertParagraph" => Ok(ActionId::EditorInsertParagraph),
            "editor::InsertHeading" => Ok(ActionId::EditorInsertHeading),
            "editor::InsertTable" => Ok(ActionId::EditorInsertTable),
            "editor::InsertFigure" => Ok(ActionId::EditorInsertFigure),
            "editor::InsertEquation" => Ok(ActionId::EditorInsertEquation),
            "editor::InsertBlockEquation" => Ok(ActionId::EditorInsertBlockEquation),
            "editor::InsertInlineEquation" => Ok(ActionId::EditorInsertInlineEquation),
            "editor::InsertQuote" => Ok(ActionId::EditorInsertQuote),
            "editor::InsertDiagram" => Ok(ActionId::EditorInsertDiagram),
            "editor::InsertList" => Ok(ActionId::EditorInsertList),
            "editor::InsertEnumeration" => Ok(ActionId::EditorInsertEnumeration),
            "editor::InsertReference" => Ok(ActionId::EditorInsertReference),
            "editor::Bold" => Ok(ActionId::EditorBold),
            "editor::Italic" => Ok(ActionId::EditorItalic),
            "editor::Underline" => Ok(ActionId::EditorUnderline),
            "editor::AddAuthor" => Ok(ActionId::EditorAddAuthor),
            "editor::RemoveAuthor" => Ok(ActionId::EditorRemoveAuthor),
            "editor::AddTableRow" => Ok(ActionId::EditorAddTableRow),
            "editor::AddTableColumn" => Ok(ActionId::EditorAddTableColumn),
            "editor::RemoveTableRow" => Ok(ActionId::EditorRemoveTableRow),
            "editor::RemoveTableColumn" => Ok(ActionId::EditorRemoveTableColumn),
            "editor::ConvertToParagraph" => Ok(ActionId::EditorConvertToParagraph),
            "editor::ConvertToHeading" => Ok(ActionId::EditorConvertToHeading),
            "editor::ConvertToTable" => Ok(ActionId::EditorConvertToTable),
            "editor::ConvertToEquation" => Ok(ActionId::EditorConvertToEquation),
            "editor::ConvertToFigure" => Ok(ActionId::EditorConvertToFigure),
            "editor::FocusField" => Ok(ActionId::EditorFocusField),
            "editor::MoveTableCellLeft" => Ok(ActionId::EditorMoveTableCellLeft),
            "editor::MoveTableCellRight" => Ok(ActionId::EditorMoveTableCellRight),
            "editor::MoveTableCellUp" => Ok(ActionId::EditorMoveTableCellUp),
            "editor::MoveTableCellDown" => Ok(ActionId::EditorMoveTableCellDown),
            "editor::EnterTable" => Ok(ActionId::EditorEnterTable),
            "editor::BodyNavigateLeft" => Ok(ActionId::EditorBodyNavigateLeft),
            "editor::BodyNavigateRight" => Ok(ActionId::EditorBodyNavigateRight),
            "editor::BodyNavigateUp" => Ok(ActionId::EditorBodyNavigateUp),
            "editor::BodyNavigateDown" => Ok(ActionId::EditorBodyNavigateDown),
            "bibliography::CreateEntry" => Ok(ActionId::BibliographyCreateEntry),
            "bibliography::OpenEntry" => Ok(ActionId::BibliographyOpenEntry),
            "bibliography::SaveEntry" => Ok(ActionId::BibliographySaveEntry),
            "bibliography::RemoveEntry" => Ok(ActionId::BibliographyRemoveEntry),
            "bibliography::CancelEdit" => Ok(ActionId::BibliographyCancelEdit),
            "resources::Create" => Ok(ActionId::ResourcesCreate),
            "resources::Open" => Ok(ActionId::ResourcesOpen),
            "resources::Edit" => Ok(ActionId::ResourcesEdit),
            "resources::Save" => Ok(ActionId::ResourcesSave),
            "resources::Remove" => Ok(ActionId::ResourcesRemove),
            "resources::InsertReference" => Ok(ActionId::ResourcesInsertReference),
            "view::OpenCommandPalette" => Ok(ActionId::ViewOpenCommandPalette),
            "view::ZoomIn" => Ok(ActionId::ViewZoomIn),
            "view::ZoomOut" => Ok(ActionId::ViewZoomOut),
            "theme::UseSystem" => Ok(ActionId::ThemeUseSystem),
            "theme::UseLight" => Ok(ActionId::ThemeUseLight),
            "theme::UseDark" => Ok(ActionId::ThemeUseDark),
            "settings::OpenGlobal" => Ok(ActionId::SettingsOpenGlobal),
            "settings::OpenProject" => Ok(ActionId::SettingsOpenProject),
            "settings::OpenKeymap" => Ok(ActionId::SettingsOpenKeymap),
            "settings::Close" => Ok(ActionId::SettingsClose),
            "help::OpenDocumentation" => Ok(ActionId::HelpOpenDocumentation),
            "help::OpenAbout" => Ok(ActionId::HelpOpenAbout),
            _ => Err(format!("unknown action id: {value}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum KeyModifier {
    Control,
    Alt,
    Shift,
    Meta,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct KeyStroke {
    pub key: String,
    #[serde(default)]
    pub modifiers: Vec<KeyModifier>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct KeyBindingPreference {
    pub action_id: ActionId,
    pub context: String,
    pub sequence: Vec<KeyStroke>,
}

pub fn normalize_key_name(key: &str) -> String {
    let trimmed = key.trim();
    match trimmed {
        " " | "Space" | "Spacebar" => "space".to_string(),
        "Esc" | "Escape" => "escape".to_string(),
        "ArrowUp" | "Up" => "arrowup".to_string(),
        "ArrowDown" | "Down" => "arrowdown".to_string(),
        "ArrowLeft" | "Left" => "arrowleft".to_string(),
        "ArrowRight" | "Right" => "arrowright".to_string(),
        "Del" | "Delete" => "delete".to_string(),
        "Return" | "Enter" => "enter".to_string(),
        "Backspace" => "backspace".to_string(),
        "Tab" => "tab".to_string(),
        value if value.chars().count() == 1 => value.to_lowercase(),
        value => value.to_ascii_lowercase(),
    }
}

pub fn parse_key_sequence(value: &str) -> Result<Vec<KeyStroke>, String> {
    let mut sequence = Vec::new();
    if value.trim().is_empty() {
        return Ok(sequence);
    }

    for chord in value.split_whitespace().filter(|item| !item.is_empty()) {
        let mut key = None;
        let mut modifiers = Vec::new();

        for part in chord
            .split('+')
            .map(str::trim)
            .filter(|item| !item.is_empty())
        {
            match part.to_ascii_lowercase().as_str() {
                "ctrl" | "control" => push_modifier(&mut modifiers, KeyModifier::Control),
                "alt" | "option" => push_modifier(&mut modifiers, KeyModifier::Alt),
                "shift" => push_modifier(&mut modifiers, KeyModifier::Shift),
                "meta" | "cmd" | "command" | "super" => {
                    push_modifier(&mut modifiers, KeyModifier::Meta)
                }
                _ => {
                    if key.is_some() {
                        return Err(format!("shortcut chord has more than one key: {chord}"));
                    }
                    key = Some(normalize_key_name(part));
                }
            }
        }

        sequence.push(KeyStroke {
            key: key.ok_or_else(|| format!("shortcut chord has no key: {chord}"))?,
            modifiers,
        });
    }

    Ok(sequence)
}

fn push_modifier(modifiers: &mut Vec<KeyModifier>, modifier: KeyModifier) {
    if !modifiers.contains(&modifier) {
        modifiers.push(modifier);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct KeymapSettings {
    #[serde(default)]
    pub keymap_profile: Option<String>,
    #[serde(default)]
    pub keymap_bindings: Vec<KeyBindingPreference>,
    #[serde(default)]
    pub keymap_overrides: Vec<KeyBindingPreference>,
}

impl Default for KeymapSettings {
    fn default() -> Self {
        Self {
            keymap_profile: Some("Default".to_string()),
            keymap_bindings: Vec::new(),
            keymap_overrides: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DependencyManifest {
    pub packages: Vec<Package>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Package {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[ts(export)]
pub struct ReferenceEntry {
    pub id: String,
    pub citation_key: String,
    pub biblatex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[ts(export)]
pub struct AssetEntry {
    pub id: String,
    pub path: String,
    pub kind: String,
    pub caption: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "type")]
pub enum DocumentSection {
    Content(ContentSection),
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ContentSection {
    pub id: String,
    pub is_optional: bool,
    pub elements: Vec<DocumentElement>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "type")]
pub enum DocumentElement {
    Heading(Heading),
    Paragraph(Paragraph),
    Quote(Quote),
    List(List),
    Enumeration(Enumeration),
    Table(Table),
    Equation(Equation),
    Figure(Box<Figure>),
    Diagram(Diagram),
    Custom(CustomElement),
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CustomElement {
    pub id: String,
    pub element_type: String,
    #[ts(type = "Record<string, any>")]
    pub fields: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Heading {
    pub id: String,
    pub level: i32,
    pub content: Vec<RichText>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Paragraph {
    pub id: String,
    pub content: Vec<RichText>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Quote {
    pub id: String,
    pub content: Vec<RichText>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct List {
    pub id: String,
    pub items: Vec<Vec<RichText>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Enumeration {
    pub id: String,
    pub items: Vec<Vec<RichText>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RichText {
    pub text: String,
    pub bold: Option<bool>,
    pub italic: Option<bool>,
    #[serde(default)]
    pub underline: Option<bool>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub reference_id: Option<String>,
    #[serde(default)]
    pub equation_source: Option<String>,
    #[serde(default)]
    pub equation_syntax: EquationSyntax,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Table {
    pub id: String,
    pub rows: i32,
    pub cols: i32,
    pub cells: Vec<Vec<TableCell>>,
    pub column_sizes: Vec<String>,
    #[serde(default)]
    #[ts(type = "Record<string, any>")]
    pub extra_fields: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TableCell {
    pub content: Vec<RichText>,
    #[serde(default)]
    pub row_span: Option<i32>,
    #[serde(default)]
    pub col_span: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Equation {
    pub id: String,
    pub latex_source: String,
    pub is_block: bool,
    #[serde(default)]
    pub syntax: EquationSyntax,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Diagram {
    pub id: String,
    pub mermaid_source: String,
    #[serde(default)]
    pub asset_id: Option<String>,
    pub caption: String,
    pub placement: String,
    #[serde(default)]
    #[ts(type = "Record<string, any>")]
    pub extra_fields: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, TS, PartialEq, Eq, Hash)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum EquationSyntax {
    #[default]
    Typst,
    Latex,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Figure {
    pub id: String,
    #[serde(default)]
    pub asset_id: Option<String>,
    pub content: DocumentElement,
    pub caption: String,
    pub placement: String,
    #[serde(default)]
    #[ts(type = "Record<string, any>")]
    pub extra_fields: std::collections::HashMap<String, serde_json::Value>,
}
