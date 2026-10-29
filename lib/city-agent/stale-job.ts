export const STALE_CLAIM_GRACE_MS = 2 * 60 * 1000

export type StaleJobDisposition =
  | "fail_held_claim"
  | "leave_terminal"
  | "leave_reclaimed"
  | "leave_other_agent"
  | "leave_missing"

export function staleJobDisposition(input: {
  runStartedAt: string | null
  orchestratorProfile: string | null
  job: { status: string; agent_profile: string | null; claimed_at: string | null } | null
}): StaleJobDisposition {
  if (!input.job) return "leave_missing"
  const profile = (input.orchestratorProfile || "ben").trim().slice(0, 160)
  const heldByProfile = (input.job.agent_profile ?? "").trim() === profile
  if (input.job.status !== "claimed") return "leave_terminal"
  if (!heldByProfile) return "leave_other_agent"
  const started = Date.parse(input.runStartedAt ?? "")
  const claimed = Date.parse(input.job.claimed_at ?? "")
  if (Number.isFinite(started) && Number.isFinite(claimed) && claimed > started + STALE_CLAIM_GRACE_MS) {
    return "leave_reclaimed"
  }
  return "fail_held_claim"
}

export function claimedBefore(runStartedAt: string | null) {
  const started = Date.parse(runStartedAt ?? "")
  const basis = Number.isFinite(started) ? started : Date.now()
  return new Date(basis + STALE_CLAIM_GRACE_MS).toISOString()
}
