#let language-terms = state("language-terms", (:))

#let get-terms(language, script) = {
  let overrides = language-terms.get()
  if language == "en" {
    (
      "and": "and",
      "Author Note": "Author Note",
      "Abstract": "Abstract",
      "Keywords": "Keywords",
      "Appendix": "Appendix",
      "Chapter": "Chapter",
      "Dedication": "Dedication",
      "List of symbols": "List of symbols",
      "Symbol": "Symbol",
      "Term": "Term",
      "Unit": "Unit",
      "Definition": "Definition",
      "List of abbreviations": "List of abbreviations",
      "Abbreviation": "Abbreviation",
      "Thesis requirement": "Graduate thesis submitted in partial fulfillment of the requirements for the degree of:",
      "Note": "Note",
      ..overrides,
    )
  } else if language == "es" {
    (
      "and": "y",
      "Author Note": "Nota del autor",
      "Abstract": "Resumen",
      "Keywords": "Palabras clave",
      "Appendix": "Apéndice",
      "Chapter": "Capítulo",
      "Dedication": "Dedicatoria",
      "List of symbols": "Lista de símbolos",
      "Symbol": "Símbolo",
      "Term": "Término",
      "Unit": "Unidad",
      "Definition": "Definición",
      "List of abbreviations": "Lista de abreviaturas",
      "Abbreviation": "Abreviatura",
      "Thesis requirement": "Trabajo de Grado presentado como requisito parcial para optar por el título de:",
      "Note": "Nota",
      ..overrides,
    )
  } else if language == "de" {
    (
      "and": "und",
      "Author Note": "Autorennotiz",
      "Abstract": "Zusammenfassung",
      "Keywords": "Schlüsselwörter",
      "Appendix": "Anhang",
      "Dedication": "Widmung",
      "Note": "Hinweis",
      ..overrides,
    )
  } else if language == "pt" {
    (
      "and": "e",
      "Author Note": "Nota do autor",
      "Abstract": "Resumo",
      "Keywords": "Palavras-chave",
      "Appendix": "Apêndice",
      "Dedication": "Dedicação",
      "Note": "Nota",
      ..overrides,
    )
  } else if language == "fr" {
    (
      "and": "et",
      "Author Note": "Note de l'auteur",
      "Abstract": "Résumé",
      "Keywords": "Mots-clés",
      "Appendix": "Annexe",
      "Dedication": "Dédicace",
      "Note": "Note",
      ..overrides,
    )
  } else if language == "it" {
    (
      "and": "e",
      "Author Note": "Nota dell'autore",
      "Abstract": "Sommario",
      "Keywords": "Parole chiave",
      "Appendix": "Appendice",
      "Dedication": "Dedica",
      "Note": "Nota",
      ..overrides,
    )
  } else if language == "nl" {
    (
      "and": "en",
      "Author Note": "Auteursopmerking",
      "Abstract": "Samenvatting",
      "Keywords": "Trefwoorden",
      "Appendix": "Bijlage",
      "Dedication": "Opdracht",
      "Note": "Notitie",
      ..overrides,
    )
  } else if (language == "sr" and script == auto) or (script == "latn" and language == "sr") {
    (
      "and": "i",
      "Author Note": "Napomena autora",
      "Abstract": "Apstrakt",
      "Keywords": "Ključne reči",
      "Appendix": "Dodatak",
      "Dedication": "Posveta",
      "Note": "Napomena",
      ..overrides,
    )
  } else if language == "sr" and script == "cyrl" {
    (
      "and": "и",
      "Author Note": "Напомена аутора",
      "Abstract": "Апстракт",
      "Keywords": "Кључне речи",
      "Appendix": "Додатак",
      "Dedication": "Посвета",
      "Note": "Напомена",
      ..overrides,
    )
  } else if language == "id" {
    (
      "and": "dan",
      "Author Note": "Catatan Penulis",
      "Abstract": "Abstrak",
      "Keywords": "Kata Kunci",
      "Appendix": "Lampiran",
      "Dedication": "Dedikasi",
      "Note": "Catatan",
      ..overrides,
    )
  } else {
    overrides
    // language-terms.get()
  }
}
