import type { AdminLanguage } from "./preference"

type Template = { language: AdminLanguage; pattern: RegExp; output: string; slots: Map<string, number>; prefix: string }
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Compile once; parameters are opaque data and must never be translated or interpreted as replacement syntax. */
export function compileTranslationTemplates(pairs: readonly (readonly [string, string])[]) {
  const templates: Template[] = []
  for (const [en, de] of pairs) for (const language of ["en", "de"] as const) {
    const source = language === "de" ? en : de
    const output = language === "de" ? de : en
    const slots = new Map<string, number>()
    let pattern = "", previousEnd = 0
    for (const match of source.matchAll(/\{(\d+)\}/g)) {
      pattern += escapePattern(source.slice(previousEnd, match.index))
      if (slots.has(match[1])) pattern += `\\${slots.get(match[1])}`
      else { slots.set(match[1], slots.size + 1); pattern += "([\\s\\S]*?)" }
      previousEnd = match.index + match[0].length
    }
    pattern += escapePattern(source.slice(previousEnd))
    // A bare placeholder is user data, never an instruction to translate it.
    if (!slots.size || source.replace(/\{\d+\}/g, "").trim().length < 2) continue
    templates.push({ language, pattern: new RegExp(`^${pattern}$`), output, slots, prefix: source.split(/\{\d+\}/)[0] })
  }
  // Prefer full, specific sentences over a short fallback such as "Delete {0}".
  return templates.sort((a, b) => b.pattern.source.length - a.pattern.source.length)
}

export function translateTemplate(value: string, language: AdminLanguage, templates: readonly Template[]) {
  for (const template of templates) {
    if (template.language !== language || !value.startsWith(template.prefix)) continue
    const match = template.pattern.exec(value)
    if (match) return template.output.replace(/\{(\d+)\}/g, (placeholder, slot: string) => match[template.slots.get(slot) ?? -1] ?? placeholder)
  }
  return undefined
}
