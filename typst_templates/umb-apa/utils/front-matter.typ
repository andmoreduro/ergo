#import "abstract-block.typ": abstract-block
#import "authorities-page.typ": authorities-page
#import "cover-page.typ": cover-page
#import "dedication-page.typ": dedication-page
#import "visible-content.typ": has-visible-content

#let front-matter(
  title: none,
  authors: none,
  affiliations: none,
  titles: none,
  advisor: none,
  co-advisor: none,
  faculties: none,
  city: none,
  country: none,
  year: none,
  authorities: none,
  dedication: none,
  acknowledgements: none,
  abstract-es: none,
  keywords-es: none,
  abstract-en: none,
  keywords-en: none,
  escudo-style: "badge",
) = context {
  let cover-args = (
    title: title,
    authors: authors,
    affiliations: affiliations,
    titles: titles,
    advisor: advisor,
    co-advisor: co-advisor,
    faculties: faculties,
    city: city,
    country: country,
    year: year,
    escudo-style: escudo-style,
  )

  cover-page(..cover-args, show-escudo: true)
  cover-page(..cover-args, show-escudo: false)

  let show-es = has-visible-content(abstract-es)
  let show-en = has-visible-content(abstract-en)
  if show-es or show-en {
    if show-es {
      abstract-block(
        [Resumen],
        abstract-es,
        keywords: keywords-es,
        keywords-label: [Palabras clave: ],
      )
    }

    if show-en {
      abstract-block(
        [Abstract],
        abstract-en,
        keywords: keywords-en,
        keywords-label: [Keywords: ],
      )
    }

    pagebreak()
  }

  authorities-page(authorities)

  dedication-page(dedication)

  if has-visible-content(acknowledgements) {
    heading(level: 1, outlined: false, bookmarked: true, numbering: none)[Agradecimientos]
    {
      acknowledgements
    }
    pagebreak()
  }
}
