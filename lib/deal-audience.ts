type AudienceDeal = {
  type?: string | null; trigger_key?: string | null; campaign_type?: string | null;
  reward_format?: string | null; discount_type?: string | null; audience?: string | null;
  premium_only?: boolean | null; allow_free_trial?: boolean | null; metadata?: unknown;
}

export function premiumCampaignKey(deal: AudienceDeal) {
  const type = deal.type || ""
  const metadata = deal.metadata && typeof deal.metadata === "object" ? deal.metadata as Record<string, unknown> : {}
  const trigger = deal.trigger_key || ""
  const lifecycle = ["time_bonus", "duration_bonus"].includes(trigger) || ["time_bonus", "duration_bonus"].includes(type) || metadata.bonus_mode === "duration_bonus" ? "time_bonus"
    : trigger === "welcome" || ["welcome", "welcome_bonus"].includes(type) ? "welcome"
    : ["comeback", "comeback_inactive"].includes(trigger) || ["comeback", "comeback_inactive", "comeback_bonus"].includes(type) ? "comeback"
    : trigger === "birthday" || type === "birthday" ? "birthday"
    : trigger === "streak" || ["streak", "streak_bonus"].includes(type) ? "streak"
    : trigger === "challenge" || ["challenge", "challenge_bonus"].includes(type) ? "challenge" : ""
  const drop = ["deal_drop", "limited_drop"].includes(deal.campaign_type || "") || ["limited_drop", "deal_drop"].includes(type)
  const twoForOne = ["two_for_one", "2for1"].includes(deal.reward_format || "") || ["two_for_one", "2for1", "twoforone"].includes(type) || ["2for1", "two_for_one", "twoforone"].includes(deal.discount_type || "")
  return [lifecycle, drop ? "deal_drop" : "", twoForOne ? "two_for_one" : ""].filter(Boolean).join(":")
}

export function requiresPremiumAudience(deal: AudienceDeal) {
  return Boolean(premiumCampaignKey(deal)) || deal.premium_only === true || deal.audience === "premium"
}

export function defaultDealAudience(deal: AudienceDeal) {
  return requiresPremiumAudience(deal) ? "premium" : "both"
}

export function partnerAudienceError(next: AudienceDeal, previous?: AudienceDeal | null) {
  if (!requiresPremiumAudience(next) && !requiresPremiumAudience(previous || {})) return null
  if (next.audience === "premium" && next.premium_only === true && !next.allow_free_trial) return null
  // A saved internal exception remains readable and survives unrelated edits.
  if (previous && premiumCampaignKey(previous) === premiumCampaignKey(next) &&
    previous.audience === next.audience && (previous.premium_only ?? false) === (next.premium_only ?? false) &&
    (previous.allow_free_trial ?? false) === (next.allow_free_trial ?? false)) return null
  return "Diese Zielgruppe ist für Partner festgelegt. Für diesen Vorteil ist Premium erforderlich."
}
