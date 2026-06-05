#import "languages.typ": get-terms

/// Level 1: "Capítulo I:" / "Chapter I:"; level 2: "1.1."; level 3: "1.1.1."; deeper levels: none.
#let chapter-numbering(..nums) = context {
  let depth = nums.pos().len()
  if depth == 1 {
    let chapter-label = get-terms(text.lang, text.script).at("Chapter")
    [#chapter-label #numbering("I", ..nums):]
  } else if depth == 2 {
    numbering("1.1", ..nums) + "."
  } else if depth == 3 {
    numbering("1.1.1", ..nums) + "."
  }
}
