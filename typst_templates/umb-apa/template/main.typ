#import "../lib.typ": front-matter, appendix, appendix-outline, apa-style

#set document(
  title: [American Psychological Association (APA) Style Template for Typst],
  keywords: ("APA", "Template", "Typst", "Versatile"),
  description: lorem(200),
)

#show: apa-style.with(
  font-size: 12pt,
)

#front-matter(
  title: [American Psychological Association (APA) Style Template for Typst],
  authors: (
    (
      name: [Author Name],
      affiliations: ("a",),
      titles: ("a",),
    ),
  ),
  affiliations: (
    "a": [Affiliation Name 1],
  ),
  titles: (
    "a": [Degree Name],
  ),
  faculties: ("Facultad de Ingeniería",),
  advisor: (
    name: [Advisor Name],
    title: [Advisor Title],
  ),
  co-advisor: (
    name: [Co-advisor Name],
    title: [Co-advisor Title],
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

#outline(title: [Contents])
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
