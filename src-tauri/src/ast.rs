use serde::{Deserialize, Deserializer, Serialize};
use std::{fmt, str::FromStr};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct DocumentAST {
    pub version: String,
    pub metadata: ProjectMetadata,
    pub dependencies: DependencyManifest,
    #[serde(default)]
    pub references: Vec<ReferenceEntry>,
    #[serde(default)]
    pub assets: Vec<AssetEntry>,
    pub sections: Vec<DocumentSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ProjectMetadata {
    pub template_id: String,
    pub title: String,
    #[serde(default)]
    pub project_settings: ProjectSettings,
    pub local_overrides: GlobalSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
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
    pub preview_debounce_ms: Option<usize>,
    #[serde(default)]
    pub history_limit: Option<usize>,
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
            preview_debounce_ms: Some(300),
            history_limit: Some(100),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
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
#[ts(export, export_to = "../../src/bindings/")]
pub struct TemplateOverride {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
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
    #[serde(rename = "editor::InsertReference")]
    EditorInsertReference,
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
            ActionId::EditorInsertReference => "editor::InsertReference",
            ActionId::EditorAddAuthor => "editor::AddAuthor",
            ActionId::EditorRemoveAuthor => "editor::RemoveAuthor",
            ActionId::EditorAddTableRow => "editor::AddTableRow",
            ActionId::EditorAddTableColumn => "editor::AddTableColumn",
            ActionId::EditorRemoveTableRow => "editor::RemoveTableRow",
            ActionId::EditorRemoveTableColumn => "editor::RemoveTableColumn",
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
            "workspace::NewProject" | "project.new" => Ok(ActionId::WorkspaceNewProject),
            "workspace::OpenProject" | "project.open" => Ok(ActionId::WorkspaceOpenProject),
            "workspace::OpenRecentProject" | "project.openRecent" => {
                Ok(ActionId::WorkspaceOpenRecentProject)
            }
            "workspace::SaveProject" | "project.save" => Ok(ActionId::WorkspaceSaveProject),
            "workspace::CloseProject" | "project.close" => Ok(ActionId::WorkspaceCloseProject),
            "workspace::ExportSvg" | "project.export.svg" => Ok(ActionId::WorkspaceExportSvg),
            "edit::Undo" | "edit.undo" => Ok(ActionId::EditUndo),
            "edit::Redo" | "edit.redo" => Ok(ActionId::EditRedo),
            "editor::DeleteElement" | "edit.deleteElement" => Ok(ActionId::EditorDeleteElement),
            "editor::InsertParagraph" | "insert.paragraph" => Ok(ActionId::EditorInsertParagraph),
            "editor::InsertHeading" | "insert.heading" => Ok(ActionId::EditorInsertHeading),
            "editor::InsertTable" | "insert.table" => Ok(ActionId::EditorInsertTable),
            "editor::InsertFigure" | "insert.figure" => Ok(ActionId::EditorInsertFigure),
            "editor::InsertEquation" | "insert.equation" => Ok(ActionId::EditorInsertEquation),
            "editor::InsertReference" | "insert.reference" => Ok(ActionId::EditorInsertReference),
            "editor::AddAuthor" | "edit.addAuthor" => Ok(ActionId::EditorAddAuthor),
            "editor::RemoveAuthor" | "edit.removeAuthor" => Ok(ActionId::EditorRemoveAuthor),
            "editor::AddTableRow" | "edit.addTableRow" => Ok(ActionId::EditorAddTableRow),
            "editor::AddTableColumn" | "edit.addTableColumn" => Ok(ActionId::EditorAddTableColumn),
            "editor::RemoveTableRow" | "edit.removeTableRow" => Ok(ActionId::EditorRemoveTableRow),
            "editor::RemoveTableColumn" | "edit.removeTableColumn" => {
                Ok(ActionId::EditorRemoveTableColumn)
            }
            "view::OpenCommandPalette" | "view.commandPalette" => {
                Ok(ActionId::ViewOpenCommandPalette)
            }
            "view::ZoomIn" | "view.zoomIn" => Ok(ActionId::ViewZoomIn),
            "view::ZoomOut" | "view.zoomOut" => Ok(ActionId::ViewZoomOut),
            "theme::UseSystem" | "view.theme.system" => Ok(ActionId::ThemeUseSystem),
            "theme::UseLight" | "view.theme.light" => Ok(ActionId::ThemeUseLight),
            "theme::UseDark" | "view.theme.dark" => Ok(ActionId::ThemeUseDark),
            "settings::OpenGlobal" | "settings.global" => Ok(ActionId::SettingsOpenGlobal),
            "settings::OpenProject" | "settings.project" => Ok(ActionId::SettingsOpenProject),
            "settings::OpenKeymap" | "settings.keymap" => Ok(ActionId::SettingsOpenKeymap),
            "settings::Close" | "settings.close" => Ok(ActionId::SettingsClose),
            "help::OpenDocumentation" | "help.documentation" => Ok(ActionId::HelpOpenDocumentation),
            "help::OpenAbout" | "help.about" => Ok(ActionId::HelpOpenAbout),
            _ => Err(format!("unknown action id: {value}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub enum KeyModifier {
    Control,
    Alt,
    Shift,
    Meta,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct KeyStroke {
    pub key: String,
    #[serde(default)]
    pub modifiers: Vec<KeyModifier>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct KeyBindingPreference {
    pub action_id: ActionId,
    pub context: String,
    pub sequence: Vec<KeyStroke>,
}

#[derive(Debug, Deserialize)]
struct KeyBindingPreferenceFields {
    #[serde(default)]
    action_id: Option<String>,
    #[serde(default)]
    command_id: Option<String>,
    #[serde(default)]
    context: Option<String>,
    #[serde(default)]
    sequence: Option<Vec<KeyStroke>>,
    #[serde(default)]
    keys: Option<String>,
    #[serde(default)]
    scope: Option<String>,
}

impl<'de> Deserialize<'de> for KeyBindingPreference {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let fields = KeyBindingPreferenceFields::deserialize(deserializer)?;
        let action_id = fields
            .action_id
            .or(fields.command_id)
            .ok_or_else(|| serde::de::Error::missing_field("action_id"))
            .and_then(|value| ActionId::from_str(&value).map_err(serde::de::Error::custom))?;

        let context = fields
            .context
            .or_else(|| fields.scope.as_deref().map(legacy_scope_to_context))
            .ok_or_else(|| serde::de::Error::missing_field("context"))?;

        let sequence = if let Some(sequence) = fields.sequence {
            sequence
        } else {
            parse_key_sequence(
                fields
                    .keys
                    .as_deref()
                    .ok_or_else(|| serde::de::Error::missing_field("sequence"))?,
            )
            .map_err(serde::de::Error::custom)?
        };

        Ok(Self {
            action_id,
            context,
            sequence,
        })
    }
}

fn legacy_scope_to_context(scope: &str) -> String {
    match scope {
        "global" => "app".to_string(),
        "project" => "workspace && !input".to_string(),
        "editor" => "editor && !input".to_string(),
        other => other.to_string(),
    }
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
#[ts(export, export_to = "../../src/bindings/")]
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
#[ts(export, export_to = "../../src/bindings/")]
pub struct DependencyManifest {
    pub packages: Vec<Package>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct Package {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ReferenceEntry {
    pub id: String,
    pub citation_key: String,
    pub biblatex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct AssetEntry {
    pub id: String,
    pub path: String,
    pub kind: String,
    pub caption: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(tag = "type")]
pub enum DocumentSection {
    Content(ContentSection),
    CoverPage(CoverPageSection),
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ContentSection {
    pub id: String,
    pub is_optional: bool,
    pub elements: Vec<DocumentElement>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct CoverPageSection {
    pub id: String,
    pub is_optional: bool,
    pub authors: Vec<Author>,
    pub affiliations: Vec<String>,
    pub abstract_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct Author {
    pub name: String,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(tag = "type")]
pub enum DocumentElement {
    Heading(Heading),
    Paragraph(Paragraph),
    Table(Table),
    Equation(Equation),
    Figure(Box<Figure>),
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct Heading {
    pub id: String,
    pub level: i32,
    pub content: Vec<RichText>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct Paragraph {
    pub id: String,
    pub content: Vec<RichText>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct RichText {
    pub text: String,
    pub bold: Option<bool>,
    pub italic: Option<bool>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub reference_id: Option<String>,
    #[serde(default)]
    pub equation_source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct Table {
    pub id: String,
    pub rows: i32,
    pub cols: i32,
    pub cells: Vec<Vec<TableCell>>,
    pub column_sizes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct TableCell {
    pub content: String,
    #[serde(default)]
    pub row_span: Option<i32>,
    #[serde(default)]
    pub col_span: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct Equation {
    pub id: String,
    pub latex_source: String,
    pub is_block: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct Figure {
    pub id: String,
    #[serde(default)]
    pub asset_id: Option<String>,
    pub content: DocumentElement,
    pub caption: String,
    pub placement: String,
}
