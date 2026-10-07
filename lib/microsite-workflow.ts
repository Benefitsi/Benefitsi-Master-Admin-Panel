import type { PartnerMicrosite } from "./microsites"

/** The stored editing version and the public version are separate states. */
export function micrositeVersions(microsite?: PartnerMicrosite | null) {
  const previousPublication = microsite?.publishedVersion ?? null
  const storedDraft = microsite?.draftVersion ?? null
  const draftTime = Date.parse(storedDraft?.created_at ?? "")
  const publishedTime = Date.parse(previousPublication?.created_at ?? "")
  const hasNewerDraft = !previousPublication || (storedDraft && (
    storedDraft.version_number != null && previousPublication.version_number != null
      ? storedDraft.version_number > previousPublication.version_number
      : Number.isFinite(draftTime) && Number.isFinite(publishedTime)
        ? draftTime > publishedTime
        : true
  ))
  const draft = hasNewerDraft ? storedDraft : null
  const published = microsite?.status === "published"
    ? microsite.publishedVersion ?? null
    : null
  return {
    editable: draft ?? previousPublication,
    draft,
    published,
  }
}
