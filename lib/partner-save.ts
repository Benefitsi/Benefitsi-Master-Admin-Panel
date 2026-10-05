/**
 * Supabase returns an empty array when an UPDATE matches no rows. Treating
 * that response as success makes the admin form look as if it saved while
 * nothing changed in the database.
 */
export function partnerUpdateWasApplied(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

export const partnerUpdateMissingMessage =
  "Partner was not found while saving. Reload the partner and try again."

type SocialValues = { platform: string | null; url: string | null; handle: string | null; sort_order: number | null }

export function partnerSocialsEqual(left: SocialValues[], right: SocialValues[]): boolean {
  const signature = (values: SocialValues[]) => JSON.stringify(values
    .map(({ platform, url, handle, sort_order }) => [platform, url, handle, sort_order])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
  return signature(left) === signature(right)
}
