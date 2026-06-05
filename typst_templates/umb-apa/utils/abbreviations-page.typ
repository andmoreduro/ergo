#import "visible-content.typ": has-visible-content
#import "languages.typ": get-terms

#let visible-abbreviations(abbreviations) = {
  if abbreviations == none or type(abbreviations) != array {
    return ()
  }
  abbreviations.filter(entry => {
    if type(entry) != dictionary {
      return false
    }
    (
      has-visible-content(entry.at("abbreviation", default: none))
      or has-visible-content(entry.at("term", default: none))
    )
  })
}

#let table-cell-content(val) = {
  if has-visible-content(val) {
    val
  } else {
    []
  }
}

#let abbreviations-page(abbreviations: none) = context {
  let entries = visible-abbreviations(abbreviations)
  if entries.len() == 0 {
    return
  }
  let terms = get-terms(text.lang, text.script)
  let list-title = terms.at("List of abbreviations", default: "List of abbreviations")
  let abbreviation-label = terms.at("Abbreviation", default: "Abbreviation")
  let term-label = terms.at("Term", default: "Term")

  heading(level: 1, outlined: false, bookmarked: true, numbering: none)[#list-title]

  set par(first-line-indent: 0em)
  // Plain `table`, not `figure(kind: table)`, so the list of tables outline skips this page.
  table(
    columns: (auto, 1fr),
    align: (left + top, left + top),
    table.header(
      [#strong[#abbreviation-label]],
      [#strong[#term-label]],
    ),
    table.hline(stroke: 0.5pt),
    ..for entry in entries {
      (
        table.cell[#table-cell-content(entry.at("abbreviation", default: none))],
        table.cell[#table-cell-content(entry.at("term", default: none))],
      )
    },
  )
  pagebreak()
}
