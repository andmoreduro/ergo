# UMB APA 7 (Typst)

Typst template for **trabajos de grado** at Universidad Manuela Beltrán, aligned with the UMB Biblioteca *Guía resumida APA 7ª edición* (`guia-resumida-apa-septima-edicion-2024.pdf` in the Érgo repo root).

## Compliance highlights

| Guía topic | Implementation |
|------------|----------------|
| US Letter, 1 in margins, page numbers top right (incl. cover) | `lib.typ` page setup |
| No running head for UMB grad works (§3.2) | `apa-style` omits running-head support |
| Serif 12 pt body (§1.3) | Default `font_size` 12 pt, Libertinus Serif |
| Double spacing (§1.4) | `double-spacing` on paragraphs and headings |
| Left-aligned text, no full justification (§2.1) | `justify: false` on `par` |
| 0.5 in first-line indent; abstract without indent (§2.2) | Body + front-matter abstracts |
| Five APA heading levels, no numbering (§4.1–4.2) | `numbering: none`; levels 4–6 run-in style |
| No separate “Introducción” heading (§4.3) | Body starts with document title as level 1 |
| Portada + contra portada (UMB) | `front-matter.typ` (second cover without escudo) |
| Resumen / Abstract + keywords | Bilingual front matter |
| Figure captions 10 pt, italic description (§10.2) | `figure.caption` at 10 pt |
| Block quotes ≥ 40 words (§11.5.3) | `quote-word-trigger` |
| References section label centered bold (§13) | Generated `#heading` before `#bibliography` |

Front-matter order: **portada → contra portada → resumen/abstract → autoridades → agradecimientos → índice → cuerpo**.

Bundled Érgo projects default to a single **contents** outline (no separate lists of tables/figures/equations), matching the guía’s page-order section for thesis work.

## Usage

```typst
#import "/umb-apa/lib.typ": front-matter, apa-style

#show: apa-style.with(font-size: 12pt)

#front-matter(
  title: [Título],
  authors: (...),
  // ...
)

= Cuerpo
```

See `template/main.typ` for a full sample.

## Package metadata

`typst.toml` retains versatile-apa versioning for packaging; runtime entry point is `lib.typ` exporting `apa-style`.
