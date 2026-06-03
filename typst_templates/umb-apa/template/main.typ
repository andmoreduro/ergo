#import "../lib.typ": front-matter, appendix, appendix-outline, versatile-apa as apa-style

#set document(
  title: [American Psychological Association (APA) Style Template for Typst],
  keywords: ("APA", "Template", "Typst", "Versatile"),
  description: lorem(200),
)

#show: apa-style.with(
  font-size: 12pt,
  running-head: [APA Style Template for Typst],
)

#front-matter(
  title: [American Psychological Association (APA) Style Template for Typst],
  authors: (
    (
      name: [Author Name],
      affiliations: ("a",),
      degrees: ("a",),
    ),
  ),
  affiliations: (
    "a": [Affiliation Name 1],
  ),
  degrees: (
    "a": [Degree Name],
  ),
  director: (
    name: [Director Name],
    title: [Director Title],
  ),
  city: [Bogotá],
  country: [Colombia],
  year: [2026],
  authorities: (
    (
      name: [Authority Name],
      role: [Authority Role],
    ),
  ),
  acknowledgements: [
    #lorem(50)
  ],
  abstract-es: [
    Resumen en español.
  ],
  keywords-es: ("Palabra", "Clave"),
  abstract-en: [
    Abstract in English.
  ],
  keywords-en: ("Keyword", "One"),
)

#outline()
#pagebreak()
#outline(target: figure.where(kind: table), title: [Tables])
#pagebreak()
#outline(target: figure.where(kind: image), title: [Figures])
#pagebreak()
#outline(target: figure.where(kind: math.equation), title: [Equations])
#pagebreak()
#outline(target: figure.where(kind: raw), title: [Listings])
#pagebreak()
#appendix-outline(title: [Appendices])
#pagebreak()

#include "sections/introduction.typ"

#pagebreak()
#include "sections/lists.typ"

#pagebreak()
#include "sections/quotes.typ"

#pagebreak()
#include "sections/computer-code.typ"

#pagebreak()
#include "sections/math.typ"

#pagebreak()
#bibliography(
  "bibliography/ref.yml",
  full: true,
  title: [References],
)

#show: appendix

#include "sections/appendix.typ"
