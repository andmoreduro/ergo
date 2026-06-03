#import "authoring.typ": print-affiliations, print-authors-stacked, print-degrees
#import "constants.typ": first-indent-length
#import "to-string.typ": to-string

#let has-visible-content(val) = {
  if val == none { return false }
  if val == [] { return false }
  if type(val) == str {
    return val.trim() != ""
  }
  let s = to-string(val)
  if s == none { return false }
  return s.trim() != ""
}

#let umb-escudo = image("../assets/escudo_umb.png", height: 7em)

#let print-director(director) = {
  if director == none or type(director) != dictionary {
    return none
  }
  let d-name = director.at("name", default: none)
  let d-title = director.at("title", default: none)
  if has-visible-content(d-name) {
    block[
      #d-name
      #if has-visible-content(d-title) [
        \ #d-title
      ]
    ]
  } else {
    none
  }
}

#let print-location(city, country, year) = {
  let has-city = has-visible-content(city)
  let has-country = has-visible-content(country)
  let has-year = has-visible-content(year)
  if not has-city and not has-country and not has-year {
    return none
  }
  block[
    #if has-city or has-country {
      if has-city and has-country {
        [#city, #country]
      } else if has-city {
        city
      } else {
        country
      }
    }
    #if has-year [
      #if has-city or has-country [\ ] else []
      #year
    ]
  ]
}

#let print-cover-bottom-group(authors, affiliations, degrees, city, country, year) = {
  block[
    #if affiliations != none {
      print-affiliations(authors, affiliations)
    }
    #if degrees != none {
      print-degrees(authors, degrees)
    }
    #print-location(city, country, year)
  ]
}

// Cover page: four leading parbreaks (versatile-apa), then a fill block with even row gutters.
#let umb-cover-page(
  title: none,
  authors: none,
  affiliations: none,
  degrees: none,
  director: none,
  city: none,
  country: none,
  year: none,
) = context {
  set document(
    title: title,
  ) if title != none

  place(top + center, umb-escudo)

  for i in range(4) {
    [~] + parbreak()
  }

  block(width: 100%, height: 1fr,
    align(center,
      grid(
        columns: 1,
        rows: 4,
        row-gutter: 1fr,
        align: center + horizon,
        std.title(),
        if authors != none {
          print-authors-stacked(authors, affiliations, degrees)
        },
        print-director(director),
        print-cover-bottom-group(authors, affiliations, degrees, city, country, year),
      )
    )
  )

  pagebreak(weak: true)
}

#let visible-authorities(authorities) = {
  if authorities == none or type(authorities) != array {
    return ()
  }
  authorities.filter(auth => {
    type(auth) == dictionary and has-visible-content(auth.at("name", default: none))
  })
}

#let umb-authorities-page(authorities) = {
  let entries = visible-authorities(authorities)
  if entries.len() == 0 {
    return
  }
  block(width: 100%, height: 1fr,
    align(center,
      grid(
        align: center + horizon,
        columns: 1,
        rows: entries.len() + 1,
        row-gutter: 1fr,
        heading(level: 1, outlined: false, bookmarked: true)[Autoridades Académicas],
        ..entries.map(auth => {
          let role = auth.at("role", default: none)
          block[
            #auth.name
            #linebreak()
            #if has-visible-content(role) [
              #role
            ]
          ]
        }),
      )
    )
  )
  pagebreak()
}

#let front-matter(
  title: none,
  authors: none,
  affiliations: none,
  degrees: none,
  director: none,
  city: none,
  country: none,
  year: none,
  authorities: none,
  acknowledgements: none,
  abstract-es: none,
  keywords-es: none,
  abstract-en: none,
  keywords-en: none,
) = context {
  umb-cover-page(
    title: title,
    authors: authors,
    affiliations: affiliations,
    degrees: degrees,
    director: director,
    city: city,
    country: country,
    year: year,
  )

  umb-authorities-page(authorities)

  if has-visible-content(acknowledgements) {
    heading(level: 1, outlined: false, bookmarked: true)[Agradecimientos]
    {
      acknowledgements
    }
    pagebreak()
  }

  let show-es = has-visible-content(abstract-es)
  let show-en = has-visible-content(abstract-en)
  if show-es or show-en {
    if show-es {
      heading(level: 1, outlined: false, bookmarked: true)[Resumen]
      v(0.5fr)
      {
        set align(left)
        set par(first-line-indent: 0in, justify: true)
        abstract-es
      }

      if keywords-es != none and keywords-es != () {
        v(0.5fr)
        emph[Palabras clave: ]
        if type(keywords-es) == array {
          keywords-es.join(", ")
        } else {
          keywords-es
        }
      }

      if show-en {
        v(1.5fr)
      }
    }

    if show-en {
      heading(level: 1, outlined: false, bookmarked: true)[Abstract]
      v(0.5fr)
      {
        set align(left)
        set par(first-line-indent: 0in, justify: true)
        abstract-en
      }

      if keywords-en != none and keywords-en != () {
        v(0.5fr)
        emph[Keywords: ]
        if type(keywords-en) == array {
          keywords-en.join(", ")
        } else {
          keywords-en
        }
      }
    }

    pagebreak()
  }
}
