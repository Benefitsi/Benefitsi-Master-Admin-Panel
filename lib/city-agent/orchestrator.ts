import {
  confidenceForTrustTier,
  riskForTrustTier,
  trustTierForSource,
  type CityAgentContentType,
  type CityAgentModuleKey,
  type CityAgentOperatingMode,
  type CityAgentRiskLevel,
  type CityAgentSourceRow,
} from "./contracts"
import { getCityAgentModule, sourceBelongsToModule } from "./modules"
import { decideAutonomousAction } from "./autonomy-policy"

export type CityAgentControlSnapshot = {
  cityId: string
  cityProfile: string
  operatingMode: CityAgentOperatingMode
  timezone: string
  autoPublishEnabled: boolean
  /** Safe default: callers must explicitly prove that prelaunch is over. */
  prelaunch?: boolean
  lastFullCheckAt: string | null
  nextFullCheckAt: string | null
  pausedReason: string | null
}

export type CityAgentModulePlan = {
  key: CityAgentModuleKey
  label: string
  cadenceMinutes: number
  sourceCount: number
  shadow: boolean
  publishable: false
}

export function planCityAgentModules(
  control: CityAgentControlSnapshot,
  sources: Array<Pick<CityAgentSourceRow, "slug" | "parser_config" | "content_scope">>,
): CityAgentModulePlan[] {
  const keys = [
    "event", "news", "discovery", "business", "freshness", "route",
    "seo_opportunity", "editorial", "media", "qa", "content_gap",
    "event_seo", "editorial_queue", "full_seo", "full_city_audit", "evergreen_deep_recheck",
  ] as const
  return keys.map((key) => {
    const definition = getCityAgentModule(key)!
    return {
      key,
      label: definition.label,
      cadenceMinutes: definition.cadenceMinutes,
      sourceCount: sources.filter((source) => sourceBelongsToModule(source, key)).length,
      shadow: control.operatingMode !== "GUARDED_AUTO",
      publishable: false,
    }
  })
}

export function classifySource(source: Pick<CityAgentSourceRow, "trust_level" | "trust_tier">) {
  const tier = trustTierForSource(source)
  return {
    tier,
    confidence: confidenceForTrustTier(tier),
    defaultRisk: riskForTrustTier(tier),
  }
}

export function shouldAutoPublish(input: {
  control: Pick<CityAgentControlSnapshot, "operatingMode" | "autoPublishEnabled"> & { prelaunch?: boolean }
  fieldMode: "AUTO" | "MANUAL" | "LOCKED"
  source: Pick<CityAgentSourceRow, "trust_level" | "trust_tier">
  confidence: number
  risk: CityAgentRiskLevel
  contentType: CityAgentContentType
  moduleKey: CityAgentModuleKey
}) {
  const definition = getCityAgentModule(input.moduleKey)
  const decision = decideAutonomousAction({
    operatingMode: input.control.operatingMode,
    autoPublishEnabled: input.control.autoPublishEnabled,
    prelaunch: input.control.prelaunch !== false,
    fieldMode: input.fieldMode,
    sourceTrustTier: trustTierForSource(input.source),
    confidence: input.confidence,
    risk: input.risk,
    contentType: input.contentType,
    operation: "update",
    fields: ["seo_title"],
    entityExists: true,
    evidenceCount: 2,
    hasConflict: false,
  })
  return input.control.operatingMode === "GUARDED_AUTO"
    && decision.decision === "AUTO"
    && Boolean(definition?.publishableInGuardedAuto)
}

export function controlledDecision(input: {
  operatingMode: CityAgentOperatingMode
  risk: CityAgentRiskLevel
  confidence: number
  fieldMode: "AUTO" | "MANUAL" | "LOCKED"
}) {
  if (input.operatingMode === "DISABLED") return "blocked" as const
  if (input.operatingMode === "SHADOW") return "shadow" as const
  if (input.fieldMode !== "AUTO" || input.risk !== "low" || input.confidence < 0.98) return "needs_human" as const
  return "policy_check" as const
}
