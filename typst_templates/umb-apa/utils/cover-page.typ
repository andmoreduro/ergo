#import "authoring.typ": print-affiliations, print-authors-stacked, print-degrees
#import "languages.typ": get-terms
#import "visible-content.typ": has-visible-content

#let escudo-image(style) = {
  if style == "badge-banner" {
    image("../assets/escudo_umb2.webp", height: 5em)
  } else {
    image("../assets/escudo_umb.png", height: 7em)
  }
}

#let print-advisor(advisor) = {
  if advisor == none or type(advisor) != dictionary {
    return none
  }
  let a-name = advisor.at("name", default: none)
  let a-title = advisor.at("title", default: none)
  if has-visible-content(a-name) {
    block[
      #a-name
      #if has-visible-content(a-title) [
        \ #a-title
      ]
    ]
  } else {
    none
  }
}

#let print-advisors-block(advisor, co-advisor) = {
  let advisor-entry = print-advisor(advisor)
  let co-advisor-entry = print-advisor(co-advisor)
  if advisor-entry == none and co-advisor-entry == none {
    return none
  }
  block[
    #advisor-entry
    #if advisor-entry != none and co-advisor-entry != none {
      parbreak()
    }
    #co-advisor-entry
  ]
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

#let print-faculties(faculties) = {
  if faculties == none {
    return none
  }
  let items = if type(faculties) == array {
    faculties.filter(item => has-visible-content(item))
  } else if has-visible-content(faculties) {
    (faculties,)
  } else {
    ()
  }
  if items.len() == 0 {
    return none
  }
  block[
    #items.join([, ])
  ]
}

#let print-cover-bottom-group(
  authors,
  affiliations,
  titles,
  faculties,
  city,
  country,
  year,
  include-titles: true,
) = {
  block[
    #if affiliations != none {
      print-affiliations(authors, affiliations)
    }
    #if include-titles and titles != none {
      print-degrees(authors, titles)
    }
    #print-faculties(faculties)
    #print-location(city, country, year)
  ]
}

#let print-thesis-titles-block(authors, titles) = context {
  if titles == none {
    return none
  }
  let intro = get-terms(text.lang, text.script).at(
    "Thesis requirement",
    default: "Graduate thesis submitted in partial fulfillment of the requirements for the degree of:",
  )
  block[
    #intro
    #parbreak()
    #print-degrees(authors, titles)
  ]
}

// Cover page: four leading parbreaks, then a fill block with even row gutters.
#let cover-page(
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
  show-escudo: true,
  escudo-style: "badge",
) = context {
  set document(
    title: title,
  ) if title != none

  if show-escudo {
    place(top + center, escudo-image(escudo-style))
  }

  for i in range(4) {
    [~] + parbreak()
  }

  block(width: 100%, height: 1fr,
    align(center,
      if show-escudo {
        grid(
          columns: 1,
          rows: 3,
          row-gutter: 1fr,
          align: center + horizon,
          std.title(),
          if authors != none {
            print-authors-stacked(authors, affiliations, titles)
          },
          print-cover-bottom-group(
            authors,
            affiliations,
            titles,
            faculties,
            city,
            country,
            year,
          ),
        )
      } else {
        grid(
          columns: 1,
          rows: 5,
          row-gutter: 1fr,
          align: center + horizon,
          std.title(),
          if authors != none {
            print-authors-stacked(authors, affiliations, titles)
          },
          print-thesis-titles-block(authors, titles),
          print-advisors-block(advisor, co-advisor),
          print-cover-bottom-group(
            authors,
            affiliations,
            titles,
            faculties,
            city,
            country,
            year,
            include-titles: false,
          ),
        )
      }
    )
  )

  pagebreak(weak: true)
}
