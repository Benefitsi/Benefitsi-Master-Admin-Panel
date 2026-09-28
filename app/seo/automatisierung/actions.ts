'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeCollectionSettings, normalizeFreeBudget } from '@/lib/seo/collection-config'

const path = '/seo/automatisierung'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const allowedErrors = new Set(['invalid_target', 'property_mismatch', 'property_required', 'invalid_gbp_location',
  'gbp_location_required', 'comparison_required', 'maps_unsupported', 'comparison_mismatch', 'invalid_limit',
  'free_confirmation_required', 'missing_cron_secret', 'retry_unavailable'])
function destination(target: string, key: 'saved' | 'error', value: string) {
  const query = new URLSearchParams({[key]: value})
  if (uuid.test(target)) query.set('target', target)
  return `${path}?${query}`
}
function failure(error: unknown, target = ''): never {
  const code = error instanceof Error ? error.message : ''
  redirect(destination(target, 'error', allowedErrors.has(code) ? code : 'storage'))
}
function success(target: string, message: string): never {
  revalidatePath(path)
  redirect(destination(target, 'saved', message))
}
function targetId(form: FormData) {
  const id = String(form.get('target_id') ?? '')
  if (!uuid.test(id)) throw Error('invalid_target')
  return id
}
function checked(form: FormData, name: string) { return form.get(name) === 'on' }

export async function saveCollectionSettings(form: FormData): Promise<void> {
  await requireAdmin()
  let id = ''
  try {
    id = targetId(form)
    const client = createAdminClient()
    const {data: target, error: targetError} = await client.from('seo_targets')
      .select('canonical_url,provider_config,status').eq('id', id).maybeSingle()
    if (targetError || !target || target.status === 'archived') throw Error('invalid_target')
    const normalized = normalizeCollectionSettings({
      enabled: checked(form, 'enabled'), crawl_enabled: checked(form, 'crawl_enabled'),
      gsc_enabled: checked(form, 'gsc_enabled'), gbp_enabled: checked(form, 'gbp_enabled'),
      psi_enabled: checked(form, 'psi_enabled'), rank_enabled: checked(form, 'rank_enabled'),
      gsc_property: String(form.get('gsc_property') ?? ''), gbp_location: String(form.get('gbp_location') ?? ''),
    }, target)
    const {error} = await client.from('seo_collection_settings').upsert({target_id: id, ...normalized})
    if (error) throw Error('storage')
  } catch (error) { failure(error, id) }
  success(id, 'settings')
}

export async function saveCollectionRuntime(form: FormData): Promise<void> {
  await requireAdmin()
  const id = String(form.get('target_id') ?? '')
  try {
    const budget = normalizeFreeBudget({monthly_request_limit: form.get('monthly_request_limit'),
      free_tier_confirmed: checked(form, 'free_tier_confirmed')})
    const {error} = await createAdminClient().from('seo_collection_runtime')
      .update({enabled: checked(form, 'enabled'), ...budget}).eq('singleton', true)
    if (error) throw Error('storage')
  } catch (error) { failure(error, id) }
  success(id, 'runtime')
}

export async function configureCollectionSchedule(form: FormData): Promise<void> {
  await requireAdmin()
  const id = String(form.get('target_id') ?? '')
  try {
    const secret = process.env.CRON_SECRET?.trim()
    if (!secret) throw Error('missing_cron_secret')
    const {data, error} = await createAdminClient().rpc('configure_seo_collection_scheduler', {p_secret: secret})
    if (error || data !== true) throw Error('storage')
  } catch (error) { failure(error, id) }
  success(id, 'schedule')
}

export async function queueCollectionNow(form: FormData): Promise<void> {
  await requireAdmin()
  const id = String(form.get('target_id') ?? '')
  try {
    const client = createAdminClient()
    const scheduled = await client.rpc('schedule_seo_collections')
    if (scheduled.error) throw Error('storage')
    const dispatched = await client.rpc('dispatch_seo_collection_tick')
    if (dispatched.error) throw Error('storage')
  } catch (error) { failure(error, id) }
  success(id, 'queued')
}

export async function retryCollectionRun(form: FormData): Promise<void> {
  await requireAdmin()
  const id = String(form.get('target_id') ?? '')
  try {
    const runId = String(form.get('run_id') ?? '')
    if (!uuid.test(runId) || !uuid.test(id)) throw Error('retry_unavailable')
    const client = createAdminClient()
    const {data: run, error: readError} = await client.from('seo_collection_runs')
      .select('id,status,attempts,target_id').eq('id', runId).eq('target_id', id).maybeSingle()
    if (readError || !run || !['failed', 'blocked'].includes(run.status) || run.attempts >= 3) throw Error('retry_unavailable')
    const {data, error} = await client.rpc('retry_seo_collection_run', {p_id: runId})
    if (error || data !== true) throw Error('retry_unavailable')
  } catch (error) { failure(error, id) }
  success(id, 'retry')
}

export async function disconnectGoogleCollection(form: FormData): Promise<void> {
  await requireAdmin()
  const id = String(form.get('target_id') ?? '')
  try {
    const provider = form.get('provider')
    if (provider !== 'gsc' && provider !== 'gbp') throw Error('storage')
    const {error} = await createAdminClient().from('seo_google_connections').delete().eq('provider', provider)
    if (error) throw Error('storage')
  } catch (error) { failure(error, id) }
  success(id, 'disconnected')
}
