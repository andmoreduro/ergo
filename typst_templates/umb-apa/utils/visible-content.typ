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
