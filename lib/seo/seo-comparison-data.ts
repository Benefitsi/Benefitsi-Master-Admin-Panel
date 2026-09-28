import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { createSeoStore } from './seo-setup'
import {
  batchesFromSnapshots,
  COMPARISON_METHOD,
  COMPARISON_EVENT_METHOD,
  comparisonDate,
  readComparisonConfig,
  readRankBatch,
  type ComparisonConfig,
  type RankBatch,
  type ComparableSnapshot,
} from './seo-comparison'

export type ComparisonPartner = {
  id: string
  name: string
  website: string | null
  city_id: string | null
}
export type ComparisonTargetOption = {
  id: string
  partnerId: string
  name: string
  url: string
  channel: string
}
type RowResult<T> = { data: T[] | null; error: unknown }
/** Avoid a global latest-300 limit silently dropping a partner's old baseline. */
export async function readAllComparisonRows<T>(
  page: (from: number, to: number) => PromiseLike<RowResult<T>>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < 50000; from += 500) {
    const result = await page(from, from + 499)
    if (result.error) throw Error('storage_error')
    rows.push(...(result.data ?? []))
    if ((result.data?.length ?? 0) < 500) return rows
  }
  throw Error('history_limit')
}
export async function getComparisonOptions(db: SupabaseClient) {
  const [partners, targets] = await Promise.all([
    readAllComparisonRows<ComparisonPartner>((from, to) =>
      db
        .from('partners')
        .select('id,name,website,city_id')
        .order('id')
        .range(from, to),
    ),
    readAllComparisonRows<{
      id: string
      partner_id: string | null
      provider_config: Record<string, unknown>
    }>((from, to) =>
      db
        .from('seo_targets')
        .select('id,partner_id,provider_config')
        .not('partner_id', 'is', null)
        .order('id')
        .range(from, to),
    ),
  ])
  const names = new Map(partners.map((p) => [p.id, p.name]))
  const campaigns: ComparisonTargetOption[] = targets.flatMap((target) => {
    const config = readComparisonConfig(target.provider_config.comparison)
    return config && target.partner_id
      ? [
          {
            id: target.id,
            partnerId: target.partner_id,
            name: names.get(target.partner_id) ?? 'Partner',
            url: config.subjectUrl,
            channel: config.channel,
          },
        ]
      : []
  })
  return {
    partners: partners.sort((a, b) => a.name.localeCompare(b.name, 'de')),
    campaigns,
  }
}
export function comparisonStore(db: SupabaseClient) {
  const existing = createSeoStore(db)
  return {
    ...existing,
    async getBatches(
      id: string,
      config: ComparisonConfig,
    ): Promise<RankBatch[]> {
      const [imports, snapshots] = await Promise.all([
        readAllComparisonRows<{
          id: string
          evidence: unknown
          created_at: string
        }>((from, to) =>
          db
            .from('seo_audit_runs')
            .select('id,evidence,created_at')
            .eq('target_id', id)
            .eq('methodology_version', COMPARISON_METHOD)
            .order('id')
            .range(from, to),
        ),
        readAllComparisonRows<ComparableSnapshot>((from, to) =>
          db
            .from('seo_rank_snapshots')
            .select(
              'id,target_id,keyword,locale,device,search_engine,location,grid_latitude,grid_longitude,rank_position,ranking_url,provider,provider_version,observed_at,confidence,coverage,serp_features',
            )
            .eq('target_id', id)
            .order('id')
            .range(from, to),
        ),
      ])
      const batches = imports.flatMap((row) => {
        if (
          !row.evidence ||
          typeof row.evidence !== 'object' ||
          Array.isArray(row.evidence)
        )
          return []
        const batch = readRankBatch(
          { ...row.evidence, id: row.id, recordedAt: row.created_at },
          config,
        )
        return batch ? [batch] : []
      })
      return [...batches, ...batchesFromSnapshots(id, config, snapshots)].sort(
        (a, b) =>
          b.observedOn.localeCompare(a.observedOn) ||
          b.recordedAt.localeCompare(a.recordedAt),
      )
    },
    async getEvents(id: string) {
      const rows = await readAllComparisonRows<{
        id: string
        summary: string
        evidence: Record<string, unknown>
        created_at: string
      }>((from, to) =>
        db
          .from('seo_audit_runs')
          .select('id,summary,evidence,created_at')
          .eq('target_id', id)
          .eq('methodology_version', COMPARISON_EVENT_METHOD)
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, to),
      )
      return rows.flatMap((r) => {
        try {
          return [
            {
              id: r.id,
              note: r.summary,
              occurredOn: comparisonDate(r.evidence?.occurredOn),
              recordedAt: r.created_at,
            },
          ]
        } catch {
          return []
        }
      })
    },
  }
}
export function importAuditId(
  targetId: string,
  batch: Omit<RankBatch, 'id' | 'recordedAt'>,
) {
  const hex = createHash('sha256')
    .update(JSON.stringify({ targetId, batch }))
    .digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
