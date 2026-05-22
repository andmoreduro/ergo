use crate::ast::{
    ContentSection, DependencyManifest, DocumentAST, DocumentElement, DocumentSection,
    GlobalSettings, Heading, Paragraph, ProjectMetadata, RichText,
};
use crate::compile_artifacts::{compile_document_snapshot, render_svgs, write_svg_pages};
use crate::document_session::DocumentSession;
use crate::vfs::VirtualFileSystem;
use serde::Serialize;
use std::fmt;
use std::str::FromStr;
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum BackendProfileScenario {
    SmallDocument,
    TypingTitle,
    LargeDocument,
}

impl BackendProfileScenario {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::SmallDocument => "small-document",
            Self::TypingTitle => "typing-title",
            Self::LargeDocument => "large-document",
        }
    }
}

impl fmt::Display for BackendProfileScenario {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for BackendProfileScenario {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "small" | "small-document" => Ok(Self::SmallDocument),
            "typing" | "typing-title" => Ok(Self::TypingTitle),
            "large" | "large-document" => Ok(Self::LargeDocument),
            _ => Err(format!(
                "Unknown scenario '{value}'. Use small-document, typing-title, or large-document."
            )),
        }
    }
}

#[derive(Clone, Debug)]
pub struct BackendProfileOptions {
    pub scenario: BackendProfileScenario,
    pub iterations: usize,
    pub render_svgs: bool,
}

impl Default for BackendProfileOptions {
    fn default() -> Self {
        Self {
            scenario: BackendProfileScenario::TypingTitle,
            iterations: 100,
            render_svgs: true,
        }
    }
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendProfileTiming {
    pub sync_snapshot_ms: f64,
    pub compile_ms: f64,
    pub render_svg_ms: f64,
    pub write_svg_ms: f64,
    pub total_ms: f64,
}

impl BackendProfileTiming {
    fn add(&mut self, other: &Self) {
        self.sync_snapshot_ms += other.sync_snapshot_ms;
        self.compile_ms += other.compile_ms;
        self.render_svg_ms += other.render_svg_ms;
        self.write_svg_ms += other.write_svg_ms;
        self.total_ms += other.total_ms;
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendProfileIteration {
    pub iteration: usize,
    pub source_revision: u64,
    pub dirty_section_count: usize,
    pub dirty_element_count: usize,
    pub fragment_count: usize,
    pub preview_page_count: usize,
    pub changed_page_count: usize,
    pub timings: BackendProfileTiming,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendProfileReport {
    pub scenario: BackendProfileScenario,
    pub requested_iterations: usize,
    pub iterations: Vec<BackendProfileIteration>,
    pub total: BackendProfileTiming,
    pub average: BackendProfileTiming,
}

pub fn run_backend_profile(options: BackendProfileOptions) -> Result<BackendProfileReport, String> {
    let iteration_count = options.iterations.max(1);
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let mut iterations = Vec::with_capacity(iteration_count);
    let mut total = BackendProfileTiming::default();

    for index in 0..iteration_count {
        let run_started = Instant::now();
        let ast = ast_for_iteration(options.scenario, index);

        let (status, sync_snapshot_ms) = measure(|| session.sync_snapshot(ast))?;
        let ((document, _source_snapshot), compile_ms) =
            measure(|| compile_document_snapshot(&vfs))?;

        let (preview_page_count, changed_page_count, render_svg_ms, write_svg_ms) = if options
            .render_svgs
        {
            let (svgs, render_ms) = measure(|| Ok::<_, String>(render_svgs(&document)))?;
            let (preview_pages, write_ms) =
                measure(|| Ok::<_, String>(write_svg_pages(&vfs, ".ergproj/preview/svg", &svgs)))?;
            (
                preview_pages.len(),
                preview_pages.iter().filter(|page| page.changed).count(),
                render_ms,
                write_ms,
            )
        } else {
            (document.pages.len(), 0, 0.0, 0.0)
        };

        let timings = BackendProfileTiming {
            sync_snapshot_ms,
            compile_ms,
            render_svg_ms,
            write_svg_ms,
            total_ms: duration_ms(run_started.elapsed()),
        };
        total.add(&timings);

        iterations.push(BackendProfileIteration {
            iteration: index + 1,
            source_revision: status.source_revision,
            dirty_section_count: status.dirty_section_ids.len(),
            dirty_element_count: status.dirty_element_ids.len(),
            fragment_count: status.fragment_count,
            preview_page_count,
            changed_page_count,
            timings,
        });
    }

    let divisor = iterations.len() as f64;
    let average = BackendProfileTiming {
        sync_snapshot_ms: total.sync_snapshot_ms / divisor,
        compile_ms: total.compile_ms / divisor,
        render_svg_ms: total.render_svg_ms / divisor,
        write_svg_ms: total.write_svg_ms / divisor,
        total_ms: total.total_ms / divisor,
    };

    Ok(BackendProfileReport {
        scenario: options.scenario,
        requested_iterations: options.iterations,
        iterations,
        total,
        average,
    })
}

fn measure<T, E: std::fmt::Display>(
    operation: impl FnOnce() -> Result<T, E>,
) -> Result<(T, f64), String> {
    let started = Instant::now();
    let value = operation().map_err(|error| error.to_string())?;
    Ok((value, duration_ms(started.elapsed())))
}

fn duration_ms(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1000.0
}

fn ast_for_iteration(scenario: BackendProfileScenario, iteration: usize) -> DocumentAST {
    match scenario {
        BackendProfileScenario::SmallDocument => base_ast("Érgo profiling sample", 1),
        BackendProfileScenario::TypingTitle => {
            let text = "rendimiento"
                .chars()
                .take((iteration % 11) + 1)
                .collect::<String>();
            base_ast(&format!("Título de {text} ñ {}", iteration + 1), 1)
        }
        BackendProfileScenario::LargeDocument => {
            base_ast(&format!("Documento grande {}", iteration + 1), 80)
        }
    }
}

fn base_ast(title: &str, paragraph_count: usize) -> DocumentAST {
    let mut inputs = std::collections::HashMap::new();
    inputs.insert("title".to_string(), serde_json::json!(title));
    inputs.insert("running_head".to_string(), serde_json::json!(""));
    inputs.insert(
        "abstract_text".to_string(),
        serde_json::json!("Resumen breve para perfilar el flujo de vista previa."),
    );
    inputs.insert("authors".to_string(), serde_json::json!([]));
    inputs.insert("affiliations".to_string(), serde_json::json!([]));
    inputs.insert("course".to_string(), serde_json::json!(""));
    inputs.insert("due_date".to_string(), serde_json::json!(""));
    inputs.insert("instructor".to_string(), serde_json::json!(""));
    inputs.insert("author_note".to_string(), serde_json::json!(""));
    inputs.insert("keywords".to_string(), serde_json::json!([]));

    DocumentAST {
        version: "1.0".to_string(),
        metadata: ProjectMetadata {
            template_id: "apa7".to_string(),
            title: title.to_string(),
            project_settings: Default::default(),
            local_overrides: GlobalSettings::default(),
            running_head: None,
            keywords: vec![],
        },
        dependencies: DependencyManifest { packages: vec![] },
        references: vec![],
        assets: vec![],
        sections: vec![DocumentSection::Content(ContentSection {
            id: "content-section".to_string(),
            is_optional: false,
            elements: content_elements(paragraph_count),
        })],
        inputs,
    }
}

fn content_elements(paragraph_count: usize) -> Vec<DocumentElement> {
    let mut elements = Vec::with_capacity(paragraph_count + 1);
    elements.push(DocumentElement::Heading(Heading {
        id: "heading-1".to_string(),
        level: 2,
        content: vec![rich_text("Introducción")],
    }));

    for index in 0..paragraph_count {
        elements.push(DocumentElement::Paragraph(Paragraph {
            id: format!("paragraph-{}", index + 1),
            content: vec![rich_text(&format!(
                "Párrafo {} con texto suficiente para renderizar una página académica de prueba.",
                index + 1
            ))],
        }));
    }

    elements
}

fn rich_text(text: &str) -> RichText {
    RichText {
        text: text.to_string(),
        bold: None,
        italic: None,
        kind: None,
        reference_id: None,
        equation_source: None,
    }
}
