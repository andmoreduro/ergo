#import "languages.typ": get-terms
#import "authoring.typ": print-affiliations, print-authors
#import "constants.typ": double-spacing, first-indent-length
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

#let front-matter(
  title: none,
  authors: none,
  affiliations: none,
  director: none,
  degree: none,
  city: none,
  year: none,
  authorities: none,
  acknowledgements: none,
  author-note: none,
  abstract-es: none,
  keywords-es: none,
  abstract-en: none,
  keywords-en: none,
) = context {
  // 1. Cover page
  {
    set page(header: none)
    set align(center)
    
    v(2.5cm)
    
    // Centered document title
    if title != none {
      block(width: 80%, text(weight: "bold", size: 1.5em, title))
    }
    
    v(1.5cm)
    
    // Centered author list
    if authors != none {
      text(size: 1.2em, print-authors(authors, affiliations, text.lang, text.script))
    }
    
    v(1.5cm)
    
    // Director block
    if director != none and type(director) == dictionary {
      let d-name = director.at("name", default: none)
      let d-title = director.at("title", default: none)
      if has-visible-content(d-name) {
        block[
          #text(style: "italic")[Director:] \
          #d-name
          #if has-visible-content(d-title) [
            \ #d-title
          ]
        ]
      }
    }
    
    v(1.5cm)
    
    // Affiliation lines from existing affiliations input
    if affiliations != none {
      print-affiliations(authors, affiliations)
    }
    
    v(1fr)
    
    // City & Year
    if has-visible-content(city) {
      text(city)
      if has-visible-content(year) [
        , #year
      ]
    } else if has-visible-content(year) {
      text(year)
    }
    
    pagebreak()
  }

  // 2. Presentation page
  {
    set page(header: none)
    set align(center)
    
    v(2.5cm)
    
    // Centered document title
    if title != none {
      block(width: 80%, text(weight: "bold", size: 1.5em, title))
    }
    
    v(1.5cm)
    
    // Centered author list
    if authors != none {
      text(size: 1.2em, print-authors(authors, affiliations, text.lang, text.script))
    }
    
    v(1.5cm)
    
    // Degree requirement text
    if has-visible-content(degree) {
      block(width: 75%)[
        Trabajo de grado presentado como requisito parcial para optar al título de #degree
      ]
    }
    
    v(1.5cm)
    
    // Director block
    if director != none and type(director) == dictionary {
      let d-name = director.at("name", default: none)
      let d-title = director.at("title", default: none)
      if has-visible-content(d-name) {
        block[
          #text(style: "italic")[Director:] \
          #d-name
          #if has-visible-content(d-title) [
            \ #d-title
          ]
        ]
      }
    }
    
    v(1.5cm)
    
    // Affiliation lines
    if affiliations != none {
      print-affiliations(authors, affiliations)
    }
    
    v(1fr)
    
    // City & Year
    if has-visible-content(city) {
      text(city)
      if has-visible-content(year) [
        , #year
      ]
    } else if has-visible-content(year) {
      text(year)
    }
    
    pagebreak()
  }

  // 3. Academic authorities page
  if authorities != none and type(authorities) == array and authorities.len() > 0 {
    set page(header: none)
    set align(center)
    
    v(2.5cm)
    heading(level: 1, outlined: false, bookmarked: true)[Autoridades Académicas]
    v(1.5cm)
    
    for auth in authorities {
      if type(auth) == dictionary {
        let name = auth.at("name", default: none)
        let role = auth.at("role", default: none)
        if has-visible-content(name) {
          block[
            #strong(name) \
            #text(style: "italic", role)
          ]
          v(1cm)
        }
      }
    }
    
    pagebreak()
  }

  // 4. Acknowledgements page
  if has-visible-content(acknowledgements) {
    set page(header: none)
    heading(level: 1, outlined: false, bookmarked: true)[Agradecimientos]
    v(1.5cm)
    
    {
      set align(left)
      set par(first-line-indent: first-indent-length, justify: true)
      acknowledgements
    }
    
    pagebreak()
  }

  // 5. Author Note page
  if has-visible-content(author-note) {
    set page(header: none)
    heading(level: 1, outlined: false, bookmarked: true)[Nota de Autor]
    v(1.5cm)
    
    {
      set align(left)
      set par(first-line-indent: first-indent-length, justify: true)
      author-note
    }
    
    pagebreak()
  }

  // 6. Bilingual abstracts page
  let show-es = has-visible-content(abstract-es)
  let show-en = has-visible-content(abstract-en)
  if show-es or show-en {
    set page(header: none)
    
    if show-es {
      heading(level: 1, outlined: false, bookmarked: true)[Resumen]
      v(0.5cm)
      {
        set align(left)
        set par(first-line-indent: 0in, justify: true)
        abstract-es
      }
      
      if keywords-es != none and keywords-es != () {
        v(0.5cm)
        emph[Palabras clave: ]
        if type(keywords-es) == array {
          keywords-es.join(", ")
        } else {
          keywords-es
        }
      }
      
      if show-en {
        v(1.5cm)
      }
    }
    
    if show-en {
      heading(level: 1, outlined: false, bookmarked: true)[Abstract]
      v(0.5cm)
      {
        set align(left)
        set par(first-line-indent: 0in, justify: true)
        abstract-en
      }
      
      if keywords-en != none and keywords-en != () {
        v(0.5cm)
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
