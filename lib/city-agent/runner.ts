import "server-only"

import {
  confidenceForTrustLevel,
  riskForTrustLevel,
  type CityAgentRunSummary,
  type CityAgentSourceFacts,
  type CityAgentSourceRow,
} from "./contracts"
import {
  createSourceResearchProvider,
  diffSourceFacts,
  nextSourceCheckAt,
  reviewCityAgentProposalsThroughHermes,
  sourceContentType,
} from "./sources"
import { createAdminClient } from "@/lib/supabase/admin"

type SupabaseClient = ReturnType<typeof createAdminClient>

type RunnerOptions = {
  cityId?: string
  agentProfile?: string
  maxSources?: number
  dryRun?: boolean
  now?: Date
  supabase?: SupabaseClient
  fetchImpl?: typeof fetch
}

type AutomationJob = {
  id: string
  city_id: string | null
  agent_profile: string | null
  human_gate: string
  input: Record<string, unknown>
}

type SnapshotRow = {
  id: string
  content_hash: string
  extracted_payload: Partial<CityAgentSourceFacts>
}

const MAX_SOURCES = 20

function boundedSources(value: number | undefined) {
  return Math.max(1, Math.min(Math.trunc(value ?? 10), MAX_SOURCES))
}

function safeText(value: unknown, maxLength = 2_000) {
  return typeof value === "string" ? value.slice(0, maxLength) : ""
}

function safeObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

async function addAudit(
  supabase: SupabaseClient,
  runId: string,
  action: string,
  details: Record<string, unknown>,
  actorProfile: string,
) {
  await supabase.from("city_agent_run_audit").insert({
    run_id: runId,
    action,
    actor_type: "agent",
    actor_profile: actorProfile,
    details: safeObject(details),
  })
}

async function completeJob(
  supabase: SupabaseClient,
  jobId: string,
  agentProfile: string,
  result: Record<string, unknown>,
  recommendedAction: string | null,
) {
  const response = await supabase.rpc("complete_automation_job", {
    p_job_id: jobId,
    p_agent_profile: agentProfile,
    p_result: result,
    p_recommended_action: recommendedAction,
  })
  if (response.error) throw new Error(`Automation-Job konnte nicht abgeschlossen werden: ${response.error.message}`)
}

async function failJob(
  supabase: SupabaseClient,
  jobId: string,
  agentProfile: string,
  errorCode: string,
) {
  await supabase.rpc("fail_automation_job", {
    p_job_id: jobId,
    p_agent_profile: agentProfile,
    p_error_code: errorCode.slice(0, 160),
  })
}

function proposalPayload(facts: CityAgentSourceFacts) {
  return {
    title: facts.title,
    headings: facts.headings,
    textPreview: facts.textPreview,
    dateMentions: facts.dateMentions,
    sourceUrl: facts.finalUrl,
    retrievedAt: facts.retrievedAt,
    drafts: facts.drafts ?? [],
    issues: facts.issues ?? [],
  }
}

export async function runNextCityAgentJob(options: RunnerOptions = {}): Promise<CityAgentRunSummary> {
  const supabase = options.supabase ?? createAdminClient()
  const now = options.now ?? new Date()
  const agentProfile = safeText(options.agentProfile ?? process.env.CITY_AGENT_PROFILE ?? "ben", 64).toLowerCase()
  const claimResult = await supabase.rpc("claim_automation_job", {
    p_agent_profile: agentProfile,
    p_supported_types: ["city_scan", "source_verification"],
    p_city_id: options.cityId ?? null,
    p_lease_minutes: 15,
  })

  if (claimResult.error) throw new Error(`City-Agent-Job konnte nicht geclaimt werden: ${claimResult.error.message}`)
  const job = (Array.isArray(claimResult.data) ? claimResult.data[0] : null) as AutomationJob | null
  if (!job) {
    return {
      claimed: false,
      provider: "none",
      sourceCount: 0,
      snapshotCount: 0,
      proposalCount: 0,
      autoPublishedCount: 0,
      staleCount: 0,
      errorCount: 0,
      status: "idle",
      errors: [],
    }
  }

  const cityId = job.city_id
  if (!cityId) {
    await failJob(supabase, job.id, agentProfile, "city_missing")
    return {
      claimed: true,
      jobId: job.id,
      provider: "none",
      sourceCount: 0,
      snapshotCount: 0,
      proposalCount: 0,
      autoPublishedCount: 0,
      staleCount: 0,
      errorCount: 1,
      status: "failed",
      errors: ["Job enthält keine Stadt."],
    }
  }

  const cityResult = await supabase.from("cities").select("id,slug,name").eq("id", cityId).maybeSingle()
  if (cityResult.error || !cityResult.data) {
    await failJob(supabase, job.id, agentProfile, "city_not_found")
    return {
      claimed: true,
      jobId: job.id,
      cityId,
      provider: "none",
      sourceCount: 0,
      snapshotCount: 0,
      proposalCount: 0,
      autoPublishedCount: 0,
      staleCount: 0,
      errorCount: 1,
      status: "failed",
      errors: ["Stadt konnte nicht geladen werden."],
    }
  }

  const citySlug = safeText(cityResult.data.slug, 120)
  const profileId = `city-${citySlug}`
  const idempotencyKey = `city-agent:${job.id}`
  const runInsert = await supabase
    .from("city_agent_runs")
    .upsert(
      {
        city_id: cityId,
        job_id: job.id,
        profile_id: profileId,
        orchestrator_profile: agentProfile,
        trigger: options.dryRun === false ? "manual" : "dry_run",
        status: "running",
        dry_run: options.dryRun !== false,
        idempotency_key: idempotencyKey,
        started_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: "city_id,idempotency_key" },
    )
    .select("id")
    .single()
  if (runInsert.error || !runInsert.data) {
    await failJob(supabase, job.id, agentProfile, "run_persist_failed")
    throw new Error(`City-Agent-Run konnte nicht gespeichert werden: ${runInsert.error?.message ?? "unbekannt"}`)
  }

  const runId = runInsert.data.id as string
  await addAudit(supabase, runId, "created", { jobId: job.id, citySlug, dryRun: options.dryRun !== false }, agentProfile)
  await addAudit(supabase, runId, "started", { maxSources: boundedSources(options.maxSources) }, agentProfile)

  const sourcesResult = await supabase
    .from("city_agent_sources")
    .select("id,city_id,slug,url,source_type,trust_level,cadence,next_check_at,parser_config,content_scope,active")
    .eq("city_id", cityId)
    .eq("active", true)
    .order("next_check_at", { ascending: true, nullsFirst: true })
    .limit(boundedSources(options.maxSources) * 2)
  if (sourcesResult.error) {
    await supabase.from("city_agent_runs").update({ status: "failed", error_code: "sources_load_failed", error_summary: sourcesResult.error.message, finished_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", runId)
    await failJob(supabase, job.id, agentProfile, "sources_load_failed")
    throw new Error(`City-Agent-Quellen konnten nicht geladen werden: ${sourcesResult.error.message}`)
  }

  const dueSources = ((sourcesResult.data ?? []) as CityAgentSourceRow[])
    .filter((source) => !source.next_check_at || new Date(source.next_check_at).getTime() <= now.getTime())
    .slice(0, boundedSources(options.maxSources))
  const provider = createSourceResearchProvider({
    now,
    fetchImpl: options.fetchImpl,
    citySlug,
    cityProfile: profileId,
    orchestratorProfile: agentProfile,
  })
  const errors: string[] = []
  let snapshotCount = 0
  let proposalCount = 0
  let autoPublishedCount = 0
  const reviewCandidates: Array<Record<string, unknown>> = []

  for (const source of dueSources) {
    const previousResult = await supabase
      .from("city_agent_source_snapshots")
      .select("id,content_hash,extracted_payload")
      .eq("source_id", source.id)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const previous = (previousResult.data ?? null) as SnapshotRow | null

    try {
      const facts = await provider.fetchSource(source)
      const snapshotInsert = await supabase
        .from("city_agent_source_snapshots")
        .upsert(
          {
            run_id: runId,
            source_id: source.id,
            fetched_at: facts.retrievedAt,
            final_url: facts.finalUrl,
            http_status: facts.httpStatus,
            content_type: facts.contentType,
            content_hash: facts.contentHash,
            title: facts.title,
            extracted_payload: {
              title: facts.title,
              headings: facts.headings,
              textPreview: facts.textPreview,
              dateMentions: facts.dateMentions,
            },
            changed_from_snapshot_id: previous?.id ?? null,
            change_summary: previous ? (facts.contentHash === previous.content_hash ? "Keine Inhaltsänderung" : "Content-Hash geändert") : "Erster Quellenbaseline",
          },
          { onConflict: "source_id,content_hash", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle()
      const snapshot = snapshotInsert.data ?? (await supabase.from("city_agent_source_snapshots").select("id").eq("source_id", source.id).eq("content_hash", facts.contentHash).maybeSingle()).data
      if (snapshot?.id) snapshotCount += 1

      const changed = !previous || previous.content_hash !== facts.contentHash
      await supabase.from("city_agent_sources").update({ last_checked_at: facts.retrievedAt, last_status: changed ? "changed" : "healthy", next_check_at: nextSourceCheckAt(source, now), updated_at: facts.retrievedAt }).eq("id", source.id)
      await addAudit(supabase, runId, "source_checked", { sourceId: source.id, changed, contentHash: facts.contentHash }, agentProfile)

      if (changed && snapshot?.id) {
        const operation = previous ? "update" : "verify"
        const deduplicationKey = `${cityId}:${source.id}:${facts.contentHash}`
        const proposalPayloadValue = proposalPayload(facts)
        const proposalResult = await supabase.from("city_agent_proposals").upsert(
          {
            city_id: cityId,
            run_id: runId,
            source_id: source.id,
            snapshot_id: snapshot.id,
            content_type: sourceContentType(source),
            operation,
            status: "needs_human",
            risk_level: riskForTrustLevel(source.trust_level),
            confidence: confidenceForTrustLevel(source.trust_level),
            field_diff: diffSourceFacts(previous?.extracted_payload ?? null, facts),
            proposed_payload: proposalPayloadValue,
            evidence: [{ url: facts.finalUrl, snapshotId: snapshot.id, retrievedAt: facts.retrievedAt, excerpt: facts.textPreview.slice(0, 500) }],
            deduplication_key: deduplicationKey,
          },
          { onConflict: "city_id,deduplication_key", ignoreDuplicates: true },
        )
        if (proposalResult.error) throw new Error(`Proposal konnte nicht gespeichert werden: ${proposalResult.error.message}`)
        const proposalRow = proposalResult.data?.[0] as { id?: string } | undefined
        const proposalId = proposalRow?.id ?? (await supabase.from("city_agent_proposals").select("id").eq("city_id", cityId).eq("deduplication_key", deduplicationKey).maybeSingle()).data?.id
        if (proposalId) {
          reviewCandidates.push({
            proposalId,
            sourceSlug: source.slug,
            trustLevel: source.trust_level,
            contentType: sourceContentType(source),
            operation,
            confidence: confidenceForTrustLevel(source.trust_level),
            risk: riskForTrustLevel(source.trust_level),
            fieldDiff: diffSourceFacts(previous?.extracted_payload ?? null, facts),
            proposedPayload: proposalPayloadValue,
            evidence: [{ url: facts.finalUrl, snapshotId: snapshot.id, retrievedAt: facts.retrievedAt, excerpt: facts.textPreview.slice(0, 500) }],
          })
        }
        proposalCount += 1
        await addAudit(supabase, runId, "proposal_created", { sourceId: source.id, operation, deduplicationKey }, agentProfile)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Quellenfehler"
      errors.push(`${source.slug}: ${message}`.slice(0, 500))
      await supabase.from("city_agent_sources").update({ last_checked_at: now.toISOString(), last_status: "error", next_check_at: nextSourceCheckAt(source, now), updated_at: now.toISOString() }).eq("id", source.id)
      await addAudit(supabase, runId, "source_checked", { sourceId: source.id, error: message.slice(0, 300) }, agentProfile)
    }
  }

  const autoPublishAllowed = options.dryRun === false && process.env.CITY_AGENT_AUTO_PUBLISH === "true"
  if ((provider.name === "hermes_city_agent" || provider.name === "hermes_required") && reviewCandidates.length > 0) {
    try {
      const review = await reviewCityAgentProposalsThroughHermes({
        now,
        citySlug,
        cityProfile: profileId,
        orchestratorProfile: agentProfile,
        fetchImpl: options.fetchImpl,
        autoPublishAllowed,
        proposals: reviewCandidates,
      })
      for (const decision of review.decisions) {
        const agentPublished = decision.decision === "auto_published" && autoPublishAllowed && decision.publishedDraftIds.length > 0
        const nextStatus = agentPublished
          ? "published"
          : decision.decision === "approved"
            ? "approved"
            : decision.decision === "reject"
              ? "rejected"
              : "needs_human"
        if (nextStatus === "published") autoPublishedCount += 1
        await supabase.from("city_agent_proposals").update({
          status: nextStatus,
          published_at: nextStatus === "published" ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString(),
        }).eq("id", decision.proposalId).eq("run_id", runId)
        await addAudit(supabase, runId, "review_linked", {
          proposalId: decision.proposalId,
          decision: decision.decision,
          confidence: decision.confidence,
          risk: decision.risk,
          reason: decision.reason,
          publishedDraftIds: decision.publishedDraftIds,
          protected_action_executed: nextStatus === "published",
          policy_blocked: decision.decision === "auto_published" && !agentPublished,
        }, agentProfile)
      }
      await addAudit(supabase, runId, "review_linked", {
        reviewer: agentProfile,
        summary: review.summary,
        decisions: review.decisions.length,
        autoPublishedCount,
        protected_action_executed: autoPublishedCount > 0,
      }, agentProfile)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ben-Review fehlgeschlagen"
      errors.push(`ben-review: ${message}`.slice(0, 500))
      await addAudit(supabase, runId, "review_linked", {
        reviewer: agentProfile,
        error: message.slice(0, 300),
        protected_action_executed: false,
      }, agentProfile)
    }
  }

  const status = errors.length ? (snapshotCount ? "partial" : "failed") : "succeeded"
  const finishedAt = new Date().toISOString()
  await supabase.from("city_agent_runs").update({ status, source_count: dueSources.length, snapshot_count: snapshotCount, proposal_count: proposalCount, stale_count: 0, error_code: errors.length ? "source_errors" : null, error_summary: errors.length ? errors.join(" | ").slice(0, 2_000) : null, metadata: { autoPublishedCount, reviewCandidateCount: reviewCandidates.length }, finished_at: finishedAt, updated_at: finishedAt }).eq("id", runId)
  await addAudit(supabase, runId, status === "failed" ? "failed" : "completed", { sourceCount: dueSources.length, snapshotCount, proposalCount, errors: errors.length, autoPublishedCount, protected_action_executed: autoPublishedCount > 0 }, agentProfile)
  if (status === "failed") {
    await failJob(supabase, job.id, agentProfile, "all_sources_failed")
  } else {
    await completeJob(
      supabase,
      job.id,
      agentProfile,
      { runId, cityId, citySlug, sourceCount: dueSources.length, snapshotCount, proposalCount, autoPublishedCount, errors: errors.slice(0, 10), protected_action_executed: autoPublishedCount > 0 },
      autoPublishedCount ? `${autoPublishedCount} City-Vorschläge wurden nach Ben-Policy veröffentlicht.` : proposalCount ? `${proposalCount} belegte Vorschläge warten auf Prüfung.` : null,
    )
  }

  return { claimed: true, jobId: job.id, runId, cityId, citySlug, provider: provider.name, sourceCount: dueSources.length, snapshotCount, proposalCount, autoPublishedCount, staleCount: 0, errorCount: errors.length, status, errors }
}
