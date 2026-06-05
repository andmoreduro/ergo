#import "visible-content.typ": has-visible-content
#import "languages.typ": get-terms

#let visible-symbols(symbols) = {
  if symbols == none or type(symbols) != array {
    return ()
  }
  symbols.filter(entry => {
    if type(entry) != dictionary {
      return false
    }
    (
      has-visible-content(entry.at("symbol", default: none))
      or has-visible-content(entry.at("term", default: none))
      or has-visible-content(entry.at("unit", default: none))
      or has-visible-content(entry.at("definition", default: none))
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

#let symbols-page(symbols: none) = context {
  let entries = visible-symbols(symbols)
  if entries.len() == 0 {
    return
  }
  let terms = get-terms(text.lang, text.script)
  let list-title = terms.at("List of symbols", default: "List of symbols")
  let symbol-label = terms.at("Symbol", default: "Symbol")
  let term-label = terms.at("Term", default: "Term")
  let unit-label = terms.at("Unit", default: "Unit")
  let definition-label = terms.at("Definition", default: "Definition")

  heading(level: 1, outlined: false, bookmarked: true, numbering: none)[#list-title]

  set par(first-line-indent: 0em)
  // Plain `table`, not `figure(kind: table)`, so the list of tables outline skips this page.
  table(
    columns: (auto, 1fr, auto, 1fr),
    align: (left + top, left + top, left + top, left + top),
    table.header(
      [#strong[#symbol-label]],
      [#strong[#term-label]],
      [#strong[#unit-label]],
      [#strong[#definition-label]],
    ),
    table.hline(stroke: 0.5pt),
    ..for entry in entries {
      (
        table.cell[#table-cell-content(entry.at("symbol", default: none))],
        table.cell[#table-cell-content(entry.at("term", default: none))],
        table.cell[#table-cell-content(entry.at("unit", default: none))],
        table.cell[#table-cell-content(entry.at("definition", default: none))],
      )
    },
  )
  pagebreak()
}
