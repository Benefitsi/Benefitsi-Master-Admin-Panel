type EditorialSection = { heading: string; paragraphs: string[] }

const noteHeadings = new Set([
  "quelle", "quellen", "bildnachweis", "bildnachweise", "bildquelle", "bildquellen",
  "fotonachweis", "fotonachweise", "quellen und bildnachweis", "quellen und bildnachweise",
  "bildnachweis und quellen", "bildnachweise und quellen",
])

/** Keep in sync with the website's editorial notes: only explicit attribution headings. */
export function splitEditorialNotes(content: EditorialSection[]) {
  const sections: EditorialSection[] = []
  const notes: EditorialSection[] = []
  for (const section of content) {
    const heading = section.heading.normalize("NFC").trim().toLocaleLowerCase("de-DE")
      .replace(/:$/, "").replace(/&/g, "und").replace(/\s+/g, " ").trim()
    ;(noteHeadings.has(heading) ? notes : sections).push(section)
  }
  return { sections, notes }
}
