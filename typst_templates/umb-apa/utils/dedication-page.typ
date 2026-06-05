#import "visible-content.typ": has-visible-content
#import "languages.typ": get-terms

#let dedication-page(dedication) = context {
  if not has-visible-content(dedication) {
    return
  }
  let label = get-terms(text.lang, text.script).at("Dedication", default: "Dedication")
  [
    #emph(dedication)
  ]
  pagebreak()
}
