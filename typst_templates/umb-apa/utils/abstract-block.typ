#import "constants.typ": first-indent-length

#let abstract-block(
  title,
  body,
  keywords: none,
  keywords-label: none,
) = {
  heading(level: 1, outlined: false, bookmarked: true, numbering: none)[#title]
  {
    set par(first-line-indent: 0in)
    body
    if keywords != none and keywords != () and keywords-label != none {
      set par(first-line-indent: first-indent-length)
      parbreak()
      emph[#keywords-label]
      if type(keywords) == array {
        keywords.join(", ")
      } else {
        keywords
      }
    }
  }
}
