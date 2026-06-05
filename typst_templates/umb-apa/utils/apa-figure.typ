#import "languages.typ": *
#import "to-string.typ": *

#let apa-figure-numbering(n) = context {
  let header-counter = counter(heading).get().first()
  let last-heading = query(selector(heading).before(here())).last()
  let queried-heading = last-heading.numbering
  let appendix-label = get-terms(text.lang, text.script).Appendix
  let in-appendix = last-heading.supplement == appendix-label
  if header-counter == 0 {
    numbering("1", n)
  } else if in-appendix and type(queried-heading) == str {
    let pattern = if queried-heading == none { "A" } else { queried-heading }
    numbering(pattern + "1", header-counter, n)
  } else {
    numbering("1.1", header-counter, n)
  }
}

#let apa-figure(
  body,
  placement: none,
  ..args,
  source: none,
  note: none,
  specific-note: none,
  probability-note: none,
) = {
  figure(
    [
      #set par(first-line-indent: 0em, justify: false)
      #body
      #set align(left)
      #if source != none [
        #context emph[#if text.lang == "es" { [Fuente.] } else { [Source.] }]
        #source
        #parbreak()
      ]
      #if note != none [
        #context emph[#get-terms(text.lang, text.script).Note.]
        #note
      ]
      #parbreak()
      #specific-note
      #parbreak()
      #probability-note
    ],
    placement: placement,
    ..args,
  )
}
