use std::fmt;
use std::str::FromStr;
use std::time::{Duration, Instant};

use ergo_core::ast::{
    DocumentAST, DocumentElement, DocumentSection, Heading, Paragraph, RichText,
};
use ergo_core::compilation_types::CompilationStatus;
use ergo_core::document_session_types::DocumentEvent;
use ergo_core::test_fixtures::basic_document_ast;
use serde::Serialize;

use crate::engine::ErgoPreviewEngine;

const DEFAULT_PIXEL_PER_PT: f32 = 2.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum WasmPreviewScenario {
    SmallDocument,
    TypingTitle,
    LargeDocument,
}

impl WasmPreviewScenario {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::SmallDocument => "small-document",
            Self::TypingTitle => "typing-title",
            Self::LargeDocument => "large-document",
        }
    }
}

impl fmt::Display for WasmPreviewScenario {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for WasmPreviewScenario {
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
pub struct WasmPreviewProfileOptions {
    pub scenario: WasmPreviewScenario,
    pub iterations: usize,
    pub pixel_per_pt: f32,
}

impl Default for WasmPreviewProfileOptions {
    fn default() -> Self {
        Self {
            scenario: WasmPreviewScenario::TypingTitle,
            iterations: 100,
            pixel_per_pt: DEFAULT_PIXEL_PER_PT,
        }
    }
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmPreviewTiming {
    pub sync_ms: f64,
    pub compile_ms: f64,
    pub render_canvas_ms: f64,
    pub total_ms: f64,
}

impl WasmPreviewTiming {
    fn add(&mut self, other: &Self) {
        self.sync_ms += other.sync_ms;
        self.compile_ms += other.compile_ms;
        self.render_canvas_ms += other.render_canvas_ms;
        self.total_ms += other.total_ms;
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmPreviewIteration {
    pub iteration: usize,
    pub preview_page_count: usize,
    pub rendered_page_count: usize,
    pub timings: WasmPreviewTiming,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmPreviewProfileReport {
    pub scenario: WasmPreviewScenario,
    pub requested_iterations: usize,
    pub iterations: Vec<WasmPreviewIteration>,
    pub total: WasmPreviewTiming,
    pub average: WasmPreviewTiming,
}

/// Simulates the WASM worker preview path: document sync → compile → canvas rasterization.
pub fn run_wasm_preview_profile(
    options: WasmPreviewProfileOptions,
) -> Result<WasmPreviewProfileReport, String> {
    let iteration_count = options.iterations.max(1);
    let mut engine = ErgoPreviewEngine::new();
    let mut iterations = Vec::with_capacity(iteration_count);
    let mut total = WasmPreviewTiming::default();

    for index in 0..iteration_count {
        let (timings, preview_page_count, rendered_page_count) =
            run_iteration(&mut engine, options.scenario, index, options.pixel_per_pt)?;
        total.add(&timings);
        iterations.push(WasmPreviewIteration {
            iteration: index + 1,
            preview_page_count,
            rendered_page_count,
            timings,
        });
    }

    let divisor = iteration_count as f64;
    let average = WasmPreviewTiming {
        sync_ms: total.sync_ms / divisor,
        compile_ms: total.compile_ms / divisor,
        render_canvas_ms: total.render_canvas_ms / divisor,
        total_ms: total.total_ms / divisor,
    };

    Ok(WasmPreviewProfileReport {
        scenario: options.scenario,
        requested_iterations: options.iterations,
        iterations,
        total,
        average,
    })
}

fn run_iteration(
    engine: &mut ErgoPreviewEngine,
    scenario: WasmPreviewScenario,
    iteration: usize,
    pixel_per_pt: f32,
) -> Result<(WasmPreviewTiming, usize, usize), String> {
    let started = Instant::now();

    let ast = match scenario {
        WasmPreviewScenario::SmallDocument => small_document_ast(iteration),
        WasmPreviewScenario::TypingTitle if iteration == 0 => basic_document_ast("Érgo", ""),
        WasmPreviewScenario::TypingTitle => {
            let title = typing_title(iteration);
            let (_, sync_ms) = measure(|| {
                engine.sync_events(vec![DocumentEvent::SetProjectTitle { title }])
            })?;
            let (result, compile_ms) = measure(|| Ok(engine.compile_preview()))?;
            let (rendered, render_ms) =
                measure(|| render_changed_pages(engine, &result, pixel_per_pt))?;
            return Ok((
                WasmPreviewTiming {
                    sync_ms,
                    compile_ms,
                    render_canvas_ms: render_ms,
                    total_ms: duration_ms(started.elapsed()),
                },
                page_count(&result),
                rendered,
            ));
        }
        WasmPreviewScenario::LargeDocument => large_document_ast(iteration),
    };

    let (_, sync_ms) = measure(|| engine.sync_snapshot(ast))?;
    let (result, compile_ms) = measure(|| Ok(engine.compile_preview()))?;
    let (rendered, render_ms) = measure(|| render_changed_pages(engine, &result, pixel_per_pt))?;

    Ok((
        WasmPreviewTiming {
            sync_ms,
            compile_ms,
            render_canvas_ms: render_ms,
            total_ms: duration_ms(started.elapsed()),
        },
        page_count(&result),
        rendered,
    ))
}

fn page_count(result: &ergo_core::compilation_types::CompilationResult) -> usize {
    result
        .preview_pages
        .as_ref()
        .map(|pages| pages.len())
        .unwrap_or(0)
}

fn render_changed_pages(
    engine: &ErgoPreviewEngine,
    result: &ergo_core::compilation_types::CompilationResult,
    pixel_per_pt: f32,
) -> Result<usize, String> {
    if result.status != CompilationStatus::Succeeded {
        return Err(
            result
                .diagnostics
                .first()
                .cloned()
                .unwrap_or_else(|| "Preview compile failed".to_string()),
        );
    }

    let images = engine.render_changed_pages(result, pixel_per_pt)?;
    Ok(images.len())
}

fn measure<T>(operation: impl FnOnce() -> Result<T, String>) -> Result<(T, f64), String> {
    let started = Instant::now();
    let value = operation()?;
    Ok((value, duration_ms(started.elapsed())))
}

fn duration_ms(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1000.0
}

fn typing_title(iteration: usize) -> String {
    let stem = "rendimiento"
        .chars()
        .take((iteration % 11) + 1)
        .collect::<String>();
    format!("Título de {stem} ñ {}", iteration + 1)
}

fn small_document_ast(iteration: usize) -> DocumentAST {
    basic_document_ast(
        &format!("Érgo profiling sample {}", iteration + 1),
        "Short abstract.",
    )
}

fn large_document_ast(iteration: usize) -> DocumentAST {
    let mut ast = basic_document_ast(
        &format!("Documento grande {}", iteration + 1),
        "Resumen breve para perfilar el flujo de vista previa.",
    );
    let DocumentSection::Content(content) = &mut ast.sections[0];
    content.elements = content_elements(80);
    ast
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
