#import "appendix.typ": appendix-outline
#import "languages.typ": get-terms

#let umb-outline-if-present(target, title: none) = context {
  if query(target).len() == 0 {
    return
  }
  if title != none {
    outline(target: target, title: title)
  } else {
    outline(target: target)
  }
  pagebreak()
}

#let umb-outlines(
  include-contents: true,
  contents-title: none,
  include-tables: true,
  tables-title: none,
  include-figures: true,
  figures-title: none,
  include-equations: true,
  equations-title: none,
  include-listings: true,
  listings-title: none,
  include-appendices: true,
  appendices-title: none,
) = context {
  if include-contents and query(heading.where(outlined: true)).len() > 0 {
    if contents-title != none {
      outline(title: contents-title)
    } else {
      outline()
    }
    pagebreak()
  }
  if include-tables {
    umb-outline-if-present(figure.where(kind: table), title: tables-title)
  }
  if include-figures {
    umb-outline-if-present(figure.where(kind: image), title: figures-title)
  }
  if include-equations {
    umb-outline-if-present(figure.where(kind: math.equation), title: equations-title)
  }
  if include-listings {
    umb-outline-if-present(figure.where(kind: raw), title: listings-title)
  }
  if include-appendices {
    let appendix-label = get-terms(text.lang, text.script).Appendix
    if query(heading.where(supplement: [#appendix-label])).len() > 0 {
      appendix-outline(title: appendices-title)
      pagebreak()
    }
  }
}
