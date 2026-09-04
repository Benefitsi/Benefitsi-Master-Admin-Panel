import type { SupabaseClient } from "@supabase/supabase-js"

export type SeoTarget = {
  id: string
  partner_id: string | null
  city_id: string | null
  domain: string
  canonical_url: string
  target_type: string
  status: string
  preferred_source_enabled: boolean
  preferred_source_mode: string
  provider_config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type SeoAutomationJob = {
  id: string
  job_type: string
  target_id: string | null
  status: string
  agent_profile: string | null
  claimed_at: string | null
  lease_until: string | null
  completed_at: string | null
  error_code: string | null
  available_at: string
  result: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type SeoAuditRun = {
  id: string
  target_id: string
  job_id: string | null
  status: string
  source_url: string
  methodology_version: string
  summary: string
  scores: Record<string, unknown>
  evidence: Record<string, unknown>
  coverage: number
  confidence: number
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export type SeoScoreSnapshot = {
  id: string
  target_id: string
  audit_run_id: string | null
  formula_version: string
  technical_score: number | null
  organic_score: number | null
  local_score: number | null
  content_entity_score: number | null
  ai_visibility_score: number | null
  overall_score: number | null
  scores: Record<string, unknown>
  coverage: number
  confidence: number
  observed_at: string
}

export type SeoFinding = {
  id: string
  target_id: string
  audit_run_id: string
  category: string
  severity: string
  status: string
  title: string
  description: string
  source_url: string | null
  recommendation: string
  evidence: Record<string, unknown>
  evidence_class: string
  confidence: number
  created_at: string
}

export type SeoRankSnapshot = {
  id: string
  target_id: string
  keyword: string
  location: string | null
  rank_position: number | null
  ranking_url: string | null
  provider: string
  observed_at: string
  confidence: number
  coverage: number
}

export type SeoKeywordSet = {
  id: string
  target_id: string
  name: string
  locale: string
  device: string
  search_engine: string
  location: string | null
  keywords: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export type SeoVisibilitySnapshot = {
  id: string
  target_id: string
  visibility_kind: string
  provider: string
  metric_name: string
  metric_value: number | null
  query_count: number | null
  mentions: number | null
  citations: number | null
  observed_at: string
  confidence: number
  coverage: number
}

export type SeoExperiment = {
  id: string
  target_id: string
  experiment_type: string
  evidence_class: string
  hypothesis: string
  target_metric: string
  status: string
  rollback_note: string
  created_at: string
  updated_at: string
}

export type SeoOperationsData = {
  targets: SeoTarget[]
  keywordSets: SeoKeywordSet[]
  audits: SeoAuditRun[]
  scores: SeoScoreSnapshot[]
  findings: SeoFinding[]
  ranks: SeoRankSnapshot[]
  visibility: SeoVisibilitySnapshot[]
  experiments: SeoExperiment[]
  jobs: SeoAutomationJob[]
  errors: string[]
}

type QueryResult<T> = {
  data: T[] | null
  error: { message: string } | null
}

function rows<T>(result: QueryResult<T>) {
  return result.data ?? []
}

export async function getSeoOperationsData(
  supabase: SupabaseClient,
): Promise<SeoOperationsData> {
  const targetsResult = await supabase
    .from("seo_targets")
    .select(
      "id,partner_id,city_id,domain,canonical_url,target_type,status,preferred_source_enabled,preferred_source_mode,provider_config,created_at,updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(200)

  const targetIds = rows(targetsResult).map((target) => target.id)

  const [keywordSetsResult, auditsResult, scoresResult, findingsResult, ranksResult, visibilityResult, experimentsResult, jobsResult] =
    await Promise.all([
      supabase
        .from("seo_keyword_sets")
        .select(
          "id,target_id,name,locale,device,search_engine,location,keywords,is_active,created_at,updated_at",
        )
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(300),
      supabase
        .from("seo_audit_runs")
        .select(
          "id,target_id,job_id,status,source_url,methodology_version,summary,scores,evidence,coverage,confidence,started_at,completed_at,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("seo_score_snapshots")
        .select(
          "id,target_id,audit_run_id,formula_version,technical_score,organic_score,local_score,content_entity_score,ai_visibility_score,overall_score,scores,coverage,confidence,observed_at",
        )
        .order("observed_at", { ascending: false })
        .limit(200),
      supabase
        .from("seo_findings")
        .select(
          "id,target_id,audit_run_id,category,severity,status,title,description,source_url,recommendation,evidence,evidence_class,confidence,created_at",
        )
        .in("status", ["open", "accepted", "experimental"])
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("seo_rank_snapshots")
        .select(
          "id,target_id,keyword,location,rank_position,ranking_url,provider,observed_at,confidence,coverage",
        )
        .order("observed_at", { ascending: false })
        .limit(300),
      supabase
        .from("seo_visibility_snapshots")
        .select(
          "id,target_id,visibility_kind,provider,metric_name,metric_value,query_count,mentions,citations,observed_at,confidence,coverage",
        )
        .order("observed_at", { ascending: false })
        .limit(300),
      supabase
        .from("seo_experiments")
        .select(
          "id,target_id,experiment_type,evidence_class,hypothesis,target_metric,status,rollback_note,created_at,updated_at",
        )
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.rpc("get_seo_job_status", { p_target_ids: targetIds }),
    ])

  const typedTargets = rows(targetsResult) as SeoTarget[]

  return {
    targets: typedTargets,
    keywordSets: rows(keywordSetsResult) as SeoKeywordSet[],
    audits: rows(auditsResult) as SeoAuditRun[],
    scores: rows(scoresResult) as SeoScoreSnapshot[],
    findings: rows(findingsResult) as SeoFinding[],
    ranks: rows(ranksResult) as SeoRankSnapshot[],
    visibility: rows(visibilityResult) as SeoVisibilitySnapshot[],
    experiments: rows(experimentsResult) as SeoExperiment[],
    jobs: rows(jobsResult as QueryResult<SeoAutomationJob>) as SeoAutomationJob[],
    errors: [
      targetsResult.error?.message,
      keywordSetsResult.error?.message,
      auditsResult.error?.message,
      scoresResult.error?.message,
      findingsResult.error?.message,
      ranksResult.error?.message,
      visibilityResult.error?.message,
      experimentsResult.error?.message,
      jobsResult.error?.message,
    ].filter(Boolean) as string[],
  }
}
