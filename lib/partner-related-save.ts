import type { SupabaseClient } from "@supabase/supabase-js"
import type { PartnerHoliday, PartnerOpeningHour, PartnerSocial } from "./admin-data"
import { partnerSocialsEqual } from "@/lib/partner-save"

type SocialInput = Pick<PartnerSocial, "platform" | "url" | "handle" | "sort_order">
type HoursInput = Omit<PartnerOpeningHour, "id" | "partner_id">
type HolidayInput = Omit<PartnerHoliday, "id" | "partner_id">
export type SavedPartnerDetails = {
  socials?: PartnerSocial[]
  opening_hours?: PartnerOpeningHour[]
  holidays?: PartnerHoliday[]
}

export async function savePartnerRelatedDetails(
  supabase: SupabaseClient,
  partnerId: string,
  socials: SocialInput[] | null,
  hours: HoursInput[] | null,
  holidays: HolidayInput[] | null,
): Promise<{ details: SavedPartnerDetails; error: string | null }> {
  if (socials === null && hours === null && holidays === null) return { details: {}, error: null }
  const { data, error } = await supabase.rpc("save_partner_related_details", {
    p_partner_id: partnerId, p_socials: socials, p_opening_hours: hours, p_holidays: holidays,
  })
  if (error) return { details: {}, error: error.message }
  const details: SavedPartnerDetails = {}
  if (!data || data.partner_id !== partnerId) return { details, error: "The saved partner settings could not be confirmed. Reload and try again." }
  for (const [key, expected] of [["socials", socials], ["opening_hours", hours], ["holidays", holidays]] as const) {
    if (expected === null) continue
    const saved = data[key]
    if (!Array.isArray(saved) || saved.length !== expected.length || saved.some(row => row.partner_id !== partnerId || !row.id)) {
      return { details: {}, error: "The saved partner settings could not be confirmed. Reload and try again." }
    }
    if (key === "socials" && !partnerSocialsEqual(saved, socials!)) {
      return { details: {}, error: "The saved social links could not be confirmed. Reload and try again." }
    }
    if (key !== "socials") {
      // PostgreSQL returns time values with seconds; compare their values rather
      // than their formatting, and ignore generated IDs and timestamps.
      const signature = (rows: typeof saved) => JSON.stringify(rows.map(row => key === "opening_hours"
        ? [row.weekday, row.opens_at?.slice(0, 5) ?? null, row.closes_at?.slice(0, 5) ?? null, row.label ?? null, row.is_closed, row.sort_order]
        : [row.holiday_date, row.opens_at?.slice(0, 5) ?? null, row.closes_at?.slice(0, 5) ?? null, row.label ?? null, row.is_closed, row.repeats_yearly ?? false])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
      if (signature(saved) !== signature(expected)) {
        return { details: {}, error: "The saved operating hours could not be confirmed. Reload and try again." }
      }
    }
    Object.assign(details, { [key]: saved })
  }
  return { details, error: null }
}
