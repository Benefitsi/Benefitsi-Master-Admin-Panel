'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin'
import { validateAiReportImport } from '@/lib/seo/ai-report-import'

export async function importAiReport(form: FormData): Promise<void> {
  const { supabase } = await requireAdmin()
  let state = 'invalid'
  try {
    const id = String(form.get('target_id') ?? '')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw Error('invalid_ai_report')
    const target = await supabase.from('seo_targets').select('id,canonical_url').eq('id', id).abortSignal(AbortSignal.timeout(8000)).maybeSingle()
    if (target.error || !target.data) throw Error('invalid_ai_report')
    const input = Object.fromEntries(['provider','report_scope','period_start','period_end','report_timezone','metric_value','exported_at'].map(key => [key, form.get(key)]))
    const row = validateAiReportImport({ ...input, evidence_confirmed: form.get('evidence_confirmed') === 'on' }, target.data)
    const result = await supabase.from('seo_ai_report_imports').insert(row).abortSignal(AbortSignal.timeout(8000))
    state = result.error?.code === '23505' ? 'duplicate' : result.error ? 'unavailable' : 'saved'
  } catch { state = 'invalid' }
  if (state === 'saved') revalidatePath('/seo/aieo')
  redirect(`/seo/aieo?state=${state}`)
}
