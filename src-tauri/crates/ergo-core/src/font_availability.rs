use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ast::ProjectSettings;
use crate::font_requirements::family_is_bundled;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FontRole {
    Text,
    Math,
    Raw,
}

const TEXT_FALLBACK_CANDIDATES: &[&str] = &["Libertinus Serif"];
const MATH_FALLBACK_CANDIDATES: &[&str] = &["Libertinus Math", "New Computer Modern Math"];
const RAW_FALLBACK_CANDIDATES: &[&str] = &["DejaVu Sans Mono"];

pub fn family_is_available(name: &str) -> bool {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return false;
    }
    if family_is_bundled(trimmed) {
        return true;
    }
    #[cfg(not(target_arch = "wasm32"))]
    if crate::font_loader::family_is_installed(trimmed) {
        return true;
    }
    false
}

pub fn bundled_fallback_for_role(role: FontRole) -> String {
    let candidates = match role {
        FontRole::Text => TEXT_FALLBACK_CANDIDATES,
        FontRole::Math => MATH_FALLBACK_CANDIDATES,
        FontRole::Raw => RAW_FALLBACK_CANDIDATES,
    };
    candidates
        .iter()
        .find(|candidate| family_is_bundled(candidate))
        .map(|candidate| (*candidate).to_string())
        .unwrap_or_else(|| candidates[0].to_string())
}

/// Family name used for Typst compilation and font loading when the requested family is missing.
pub fn effective_font_family(requested: Option<&str>, role: FontRole) -> String {
    if let Some(name) = requested.map(str::trim).filter(|name| !name.is_empty()) {
        if family_is_available(name) {
            return name.to_string();
        }
    }
    bundled_fallback_for_role(role)
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct FontAvailability {
    pub requested: Option<String>,
    pub available: bool,
    pub fallback: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFontAvailability {
    pub text_font: FontAvailability,
    pub math_font: FontAvailability,
    pub raw_font: FontAvailability,
}

fn font_availability(requested: Option<&str>, role: FontRole) -> FontAvailability {
    let requested = requested
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string);
    let available = requested
        .as_deref()
        .map(family_is_available)
        .unwrap_or(false);
    FontAvailability {
        requested,
        available,
        fallback: bundled_fallback_for_role(role),
    }
}

pub fn check_project_font_availability(settings: &ProjectSettings) -> ProjectFontAvailability {
    ProjectFontAvailability {
        text_font: font_availability(settings.text_font.as_deref(), FontRole::Text),
        math_font: font_availability(settings.math_font.as_deref(), FontRole::Math),
        raw_font: font_availability(settings.raw_font.as_deref(), FontRole::Raw),
    }
}

/// Project settings with unavailable families replaced by bundled Typst fallbacks (compile path).
pub fn resolve_project_settings_fonts(settings: &ProjectSettings) -> ProjectSettings {
    ProjectSettings {
        text_font: Some(effective_font_family(
            settings.text_font.as_deref(),
            FontRole::Text,
        )),
        math_font: Some(effective_font_family(
            settings.math_font.as_deref(),
            FontRole::Math,
        )),
        raw_font: Some(effective_font_family(
            settings.raw_font.as_deref(),
            FontRole::Raw,
        )),
        ..settings.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_text_font_is_available() {
        assert!(family_is_available("Libertinus Serif"));
    }

    #[test]
    fn missing_family_uses_bundled_fallback() {
        assert_eq!(
            effective_font_family(Some("Definitely Not A Real Font 9000"), FontRole::Text),
            bundled_fallback_for_role(FontRole::Text)
        );
    }

    #[test]
    fn unavailable_font_reports_fallback() {
        let settings = ProjectSettings {
            text_font: Some("Definitely Not A Real Font 9000".to_string()),
            ..ProjectSettings::default()
        };
        let availability = check_project_font_availability(&settings);
        assert!(!availability.text_font.available);
        assert_eq!(
            availability.text_font.fallback,
            bundled_fallback_for_role(FontRole::Text),
        );
    }
}
