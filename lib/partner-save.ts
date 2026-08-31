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
