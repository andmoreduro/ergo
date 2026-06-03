#import "languages.typ": get-terms

// Normalize authors to a standard format
#let normalize-authors(authors) = {
  if authors == none {
    return none
  }

  if type(authors) == content or type(authors) == str {
    return (authors,)
  }

  if type(authors) == array {
    if authors.len() == 0 {
      return ()
    }

    if authors.len() == 1 {
      let author = authors.at(0)
      if type(author) == content or type(author) == str {
        return (author,)
      }
      return (author,)
    }

    return authors
  }

  if type(authors) == dictionary {
    if authors.keys().len() == 1 {
      let key = authors.keys().at(0)
      return (authors.at(key),)
    }
    return authors
  }

  return authors
}

// Normalize affiliations or degrees to a standard format
#let normalize-affiliations(affiliations) = {
  if affiliations == none {
    return none
  }

  if type(affiliations) == content or type(affiliations) == str {
    return (affiliations,)
  }

  if type(affiliations) == dictionary {
    if affiliations.keys().len() == 0 {
      return ()
    }

    if affiliations.keys().len() == 1 {
      let key = affiliations.keys().at(0)
      return ((id: key, name: affiliations.at(key)),)
    }

    return affiliations.keys().map(key => (id: key, name: affiliations.at(key)))
  }

  panic("Affiliations must be a dictionary with format (\"a\": [name], ...) or a single content/string value")
}

#let all-simple(items) = {
  if type(items) != array {
    return type(items) == content or type(items) == str
  }

  for item in items {
    if type(item) != content and type(item) != str {
      return false
    }
  }
  return true
}

#let to-key(value) = {
  if type(value) == dictionary and "id" in value {
    return value.id
  } else if type(value) == content {
    return repr(value)
  } else if type(value) == str {
    return value
  } else {
    return repr(value)
  }
}

#let has-different-affiliations(authors) = {
  if type(authors) != array or authors.len() <= 1 {
    return false
  }

  let first = authors.at(0)
  if type(first) != dictionary {
    return false
  }

  let unique-affiliations = ()
  for author in authors {
    if "affiliations" not in author {
      continue
    }

    let author-affs = if type(author.affiliations) == array {
      author.affiliations
    } else {
      (author.affiliations,)
    }

    for aff in author-affs {
      let aff-id = to-key(aff)
      if aff-id not in unique-affiliations {
        unique-affiliations.push(aff-id)
      }
    }
  }

  return unique-affiliations.len() > 1
}

#let affiliation-letter(pos) = str.from-unicode(96 + pos)

#let enumerate-affiliations(affiliations) = {
  let result = ()
  let count = 1

  for affiliation in affiliations {
    let marker = affiliation-letter(count)
    let entry = if type(affiliation) == dictionary and "id" in affiliation {
      (id: affiliation.id, name: affiliation.name, marker: marker)
    } else if type(affiliation) == dictionary and "name" in affiliation {
      (name: affiliation.name, marker: marker)
    } else {
      (name: affiliation, marker: marker)
    }
    result.push(entry)
    count += 1
  }

  return result
}

#let reference-markers(
  author,
  enumerated-items,
  field: "affiliations",
) = {
  if type(author) != dictionary or field not in author {
    return ()
  }

  let refs = if type(author.at(field)) == array {
    author.at(field)
  } else {
    (author.at(field),)
  }

  let positions = (:)
  for item in enumerated-items {
    let key = to-key(item)
    positions.insert(key, item.marker)
  }

  refs
    .map(ref => positions.at(to-key(ref), default: none))
    .filter(m => m != none)
}

#let print-authors-with-superscripts(authors, affiliations, language, script) = {
  let enumerated-affs = enumerate-affiliations(affiliations)

  let author-strings = authors.map(author => {
    let name = if type(author) == dictionary { author.name } else { author }
    let markers = reference-markers(author, enumerated-affs, field: "affiliations")

    if markers.len() > 0 {
      [#name#markers.map(m => super[#m]).join()]
    } else {
      name
    }
  })

  if author-strings.len() == 2 {
    author-strings.join([ #context get-terms(language, script).and ])
  } else {
    author-strings.join([, ], last: [, #context get-terms(language, script).and ])
  }
}

#let print-authors(authors, affiliations, language, script) = {
  if authors == none {
    return none
  }

  let norm-authors = normalize-authors(authors)
  let norm-affiliations = normalize-affiliations(affiliations)

  if norm-authors.len() == 1 and all-simple(norm-authors) {
    return norm-authors.at(0)
  }

  if all-simple(norm-authors) {
    let author-names = norm-authors
    if author-names.len() == 2 {
      author-names.join([ #context get-terms(language, script).and ])
    } else {
      author-names.join([, ], last: [, #context get-terms(language, script).and ])
    }
  } else {
    if has-different-affiliations(norm-authors) {
      print-authors-with-superscripts(norm-authors, norm-affiliations, language, script)
    } else {
      let author-names = norm-authors.map(it => {
        if type(it) == dictionary { it.name } else { it }
      })
      if author-names.len() == 2 {
        author-names.join([ #context get-terms(language, script).and ])
      } else {
        author-names.join([, ], last: [, #context get-terms(language, script).and ])
      }
    }
  }
}

#let print-affiliations(authors, affiliations) = {
  if affiliations == none {
    return none
  }

  let norm-affiliations = normalize-affiliations(affiliations)

  if norm-affiliations.len() == 1 and all-simple(norm-affiliations) {
    return norm-affiliations.at(0)
  }

  let norm-authors = normalize-authors(authors)

  if norm-affiliations.len() > 1 {
    enumerate-affiliations(norm-affiliations)
      .map(aff => {
        let name = if type(aff) == dictionary { aff.name } else { aff }
        [#super[#aff.marker] #name#parbreak()]
      })
      .join()
  } else {
    norm-affiliations
      .map(aff => {
        let name = if type(aff) == dictionary { aff.name } else { aff }
        [#name#parbreak()]
      })
      .join()
  }
}

// UMB cover: one author per line, optional affiliation and degree markers.
#let print-authors-stacked(authors, affiliations, degrees) = {
  if authors == none {
    return none
  }

  let norm-authors = normalize-authors(authors)
  let norm-affiliations = if affiliations != none { normalize-affiliations(affiliations) } else { () }
  let norm-degrees = if degrees != none { normalize-affiliations(degrees) } else { () }
  let enumerated-affs = enumerate-affiliations(norm-affiliations)
  let enumerated-degrees = enumerate-affiliations(norm-degrees)

  let show-aff-markers = enumerated-affs.len() > 1
  let show-degree-markers = enumerated-degrees.len() > 1

  norm-authors
    .map(author => {
      let name = if type(author) == dictionary { author.name } else { author }
      let aff-markers = if show-aff-markers {
        reference-markers(author, enumerated-affs, field: "affiliations")
      } else {
        ()
      }
      let degree-markers = if show-degree-markers {
        reference-markers(author, enumerated-degrees, field: "degrees")
      } else {
        ()
      }
      let markers = aff-markers + degree-markers
      if markers.len() > 0 {
        [#name#markers.map(m => super[#m]).join()#parbreak()]
      } else {
        [#name#parbreak()]
      }
    })
    .join()
}

#let print-degrees(_authors, degrees) = {
  if degrees == none {
    return none
  }

  let norm-degrees = normalize-affiliations(degrees)
  if norm-degrees.len() == 0 {
    return none
  }

  if norm-degrees.len() > 1 {
    enumerate-affiliations(norm-degrees)
      .map(degree => {
        let name = if type(degree) == dictionary { degree.name } else { degree }
        [#super[#degree.marker] #name#parbreak()]
      })
      .join()
  } else {
    let name = if type(norm-degrees.at(0)) == dictionary { norm-degrees.at(0).name } else { norm-degrees.at(0) }
    [#name#parbreak()]
  }
}
