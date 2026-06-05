#import "visible-content.typ": has-visible-content

#let visible-authorities(authorities) = {
  if authorities == none or type(authorities) != array {
    return ()
  }
  authorities.filter(auth => {
    type(auth) == dictionary and has-visible-content(auth.at("name", default: none))
  })
}

#let authorities-page(authorities) = {
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
        heading(
          level: 1,
          outlined: false,
          bookmarked: true,
          numbering: none,
        )[Autoridades Académicas],
        ..entries.map(auth => {
          let role = auth.at("role", default: none)
          block[
            #auth.name
            #linebreak()
            #if has-visible-content(role) [
              #strong(role)
            ]
          ]
        }),
      )
    )
  )
  pagebreak()
}
