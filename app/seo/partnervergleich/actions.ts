'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin'
import {
  validateComparisonConfig,
  readComparisonConfig,
  parseRankImport,
  freezeBaseline,
  comparisonDate,
  COMPARISON_METHOD,
  COMPARISON_EVENT_METHOD,
} from '@/lib/seo/seo-comparison'
import { comparisonStore, importAuditId } from '@/lib/seo/seo-comparison-data'

const path = '/seo/partnervergleich'
const messages: Record<string, string> = {
  invalid_comparison:
    'Bitte Messziel, Keywords, Ort, Sprache und Gerät vollständig eingeben.',
  invalid_keywords:
    'Bitte 1 bis 50 unterschiedliche Keywords eingeben, eines pro Zeile, ohne Semikolon.',
  invalid_date:
    'Bitte ein gültiges Datum eingeben, das nicht in der Zukunft liegt.',
  invalid_coordinates:
    'Für Google Maps wird ein fester Suchpunkt mit gültigen Koordinaten benötigt.',
  invalid_maps:
    'Bitte die öffentliche Google-Maps-URL dieses Betriebs verwenden.',
  invalid_url:
    'Bitte eine öffentliche Webadresse ohne Zugangsdaten oder geheime Parameter eingeben.',
  keyword_mismatch:
    'Der Import muss jedes konfigurierte Keyword genau einmal enthalten.',
  invalid_rows:
    'Pro Zeile werden Keyword;Position;Treffer-URL erwartet. Für fehlende Treffer und Messwerte bleibt die URL leer.',
  invalid_position:
    'Position muss eine ganze Zahl innerhalb der Suchtiefe, >Suchtiefe oder ? sein.',
  ranking_url_mismatch:
    'Ein gemessener Treffer muss zum festgelegten Messziel gehören. Bei Maps bitte die gespeicherte Profil-URL verwenden.',
  invalid_depth: 'Bitte eine Suchtiefe zwischen 10 und 1000 eingeben.',
  evidence_confirmation:
    'Bitte bestätigen, dass Quelle und Suchbedingungen des Imports geprüft wurden.',
  not_a_rank_tracker:
    'Search-Console-Durchschnittspositionen und allgemeine Websuchen sind keine vergleichbaren Keyword-Rangmessungen.',
  no_evidence:
    'Es liegt noch keine auswertbare Rangmessung vor. Zuerst einen belegten Messstand erfassen.',
  invalid_target: 'Der Partnervergleich wurde nicht gefunden.',
  stale_update:
    'Der Vergleich wurde inzwischen geändert. Bitte neu laden und erneut prüfen.',
  baseline_locked:
    'Die Ausgangsmessung ist bereits festgeschrieben und wird nicht ersetzt.',
  package_locked: 'Der Paketbeginn ist bereits dokumentiert.',
  partnership_locked: 'Der Beginn der Partnerschaft ist bereits dokumentiert.',
  comparison_exists:
    'Für diese Webadresse ist bereits ein Vergleich mit festen Suchbedingungen angelegt. Bitte den vorhandenen Vergleich verwenden. Pro Messziel wird derzeit ein Ort und Gerät unterstützt.',
  target_owned:
    'Diese Webadresse ist bereits einem anderen SEO-Ziel zugeordnet.',
  keyword_storage:
    'Der Vergleich ist gespeichert, das Keyword-Set noch nicht. Bitte dieselbe Einrichtung erneut speichern.',
  history_limit:
    'Die Historie ist zu groß für einen vollständigen Vergleich. Bitte den Datenzugriff erweitern; es werden keine Teilzahlen ausgegeben.',
}
function fail(error: unknown, id = ''): never {
  const message = error instanceof Error ? messages[error.message] : null
  redirect(
    `${path}?target=${encodeURIComponent(id)}&error=${encodeURIComponent(message ?? 'Speichern nicht möglich. Bitte erneut versuchen.')}`,
  )
}
function complete(id: string, message: string): never {
  revalidatePath(path)
  revalidatePath('/seo')
  redirect(
    `${path}?target=${encodeURIComponent(id)}&saved=${encodeURIComponent(message)}`,
  )
}
export async function createComparisonAction(form: FormData): Promise<void> {
  const { supabase } = await requireAdmin()
  let id = ''
  try {
    const partnerId = String(form.get('partner_id') ?? '')
    const partner = await supabase
      .from('partners')
      .select('id,city_id')
      .eq('id', partnerId)
      .maybeSingle()
    if (partner.error || !partner.data) throw Error('invalid_target')
    const requested = validateComparisonConfig({
      channel: form.get('channel'),
      subjectUrl: form.get('subject_url'),
      keywords: String(form.get('keywords') ?? '')
        .split(/\r?\n/)
        .filter((k) => k.trim()),
      location: form.get('location'),
      locale: form.get('locale'),
      device: form.get('device'),
      latitude: form.get('latitude'),
      longitude: form.get('longitude'),
      partnerSince: form.get('partner_since'),
      packageStartedOn: form.get('package_started_on'),
    })
    const existing = await supabase
      .from('seo_targets')
      .select('id,partner_id,provider_config,updated_at')
      .eq('canonical_url', requested.subjectUrl)
      .maybeSingle()
    if (existing.error) throw Error('storage_error')
    let config = requested
    if (existing.data) {
      if (existing.data.partner_id !== partnerId) throw Error('target_owned')
      id = existing.data.id
      const stored = readComparisonConfig(
        existing.data.provider_config?.comparison,
      )
      if (stored) {
        if (
          JSON.stringify({ ...stored, baseline: null }) !==
          JSON.stringify(requested)
        )
          throw Error('comparison_exists')
        config = stored
      } else if (
        !(await comparisonStore(supabase).updateConfig(
          id,
          existing.data.updated_at,
          { ...existing.data.provider_config, comparison: config },
        ))
      )
        throw Error('stale_update')
    } else {
      const created = await supabase
        .from('seo_targets')
        .insert({
          partner_id: partnerId,
          city_id: partner.data.city_id,
          domain: new URL(config.subjectUrl).hostname,
          canonical_url: config.subjectUrl,
          target_type: 'domain',
          status: 'paused',
          preferred_source_enabled: false,
          preferred_source_mode: 'disabled',
          provider_config: { comparison: config },
        })
        .select('id')
        .single()
      if (created.error || !created.data)
        throw Error(
          created.error?.code === '23505' ? 'target_owned' : 'storage_error',
        )
      id = created.data.id
    }
    // The uniqueness index is on lower(name), not an ordinary upsert conflict target.
    const found = await supabase
      .from('seo_keyword_sets')
      .select('id')
      .eq('target_id', id)
      .eq('name', 'Partnervergleich')
      .maybeSingle()
    if (found.error) throw Error('keyword_storage')
    const row = {
      target_id: id,
      name: 'Partnervergleich',
      keywords: config.keywords,
      locale: config.locale,
      device: config.device,
      location: config.location,
      search_engine: 'google',
      is_active: true,
    }
    const result = found.data
      ? await supabase
          .from('seo_keyword_sets')
          .update(row)
          .eq('id', found.data.id)
      : await supabase.from('seo_keyword_sets').insert(row)
    if (result.error) throw Error('keyword_storage')
  } catch (error) {
    fail(error, id)
  }
  complete(
    id,
    'Partnervergleich gespeichert. Neue Messziele warten auf die Anbieterfreigabe.',
  )
}
export async function importComparisonAction(form: FormData): Promise<void> {
  const { supabase, adminSession } = await requireAdmin()
  const id = String(form.get('target_id') ?? '')
  try {
    const store = comparisonStore(supabase),
      target = await store.getTarget(id)
    const config = readComparisonConfig(target?.provider_config.comparison)
    if (!target?.partner_id || !config) throw Error('invalid_target')
    const batch = parseRankImport(config, {
      observedOn: form.get('observed_on'),
      provider: form.get('provider'),
      method: form.get('method'),
      depth: form.get('depth'),
      reference: form.get('reference'),
      rows: form.get('rows'),
      confirmed: form.get('confirmed') === 'on',
    })
    const coverage =
      batch.results.filter((r) => r.state !== 'unknown').length /
      config.keywords.length
    const result = await supabase.from('seo_audit_runs').insert({
      id: importAuditId(id, batch),
      target_id: id,
      status: coverage === 1 ? 'completed' : 'partial',
      source_url: config.subjectUrl,
      methodology_version: COMPARISON_METHOD,
      summary: `Import ${batch.observedOn} · ${batch.provider}`,
      scores: {},
      evidence: { ...batch, recordedBy: adminSession.user.id },
      coverage,
      confidence: 0,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    if (result.error && result.error.code !== '23505')
      throw Error('storage_error')
  } catch (error) {
    fail(error, id)
  }
  complete(
    id,
    'Belegter Messstand gespeichert. Ein identischer Import wird nicht doppelt angelegt.',
  )
}
export async function freezeComparisonAction(form: FormData): Promise<void> {
  const { supabase } = await requireAdmin()
  const id = String(form.get('target_id') ?? '')
  try {
    await freezeBaseline(
      async () => comparisonStore(supabase),
      id,
      String(form.get('updated_at') ?? ''),
    )
  } catch (error) {
    fail(error, id)
  }
  complete(id, 'Früheste verfügbare Ausgangsmessung dauerhaft festgeschrieben.')
}
export async function addComparisonEventAction(form: FormData): Promise<void> {
  const { supabase, adminSession } = await requireAdmin()
  const id = String(form.get('target_id') ?? '')
  try {
    const store = comparisonStore(supabase),
      target = await store.getTarget(id)
    const config = readComparisonConfig(target?.provider_config.comparison)
    if (!target?.partner_id || !config) throw Error('invalid_target')
    const occurredOn = comparisonDate(form.get('occurred_on'))
    if (form.get('kind') === 'package' || form.get('kind') === 'partnership') {
      const field =
        form.get('kind') === 'package' ? 'packageStartedOn' : 'partnerSince'
      if (config[field])
        throw Error(
          field === 'packageStartedOn'
            ? 'package_locked'
            : 'partnership_locked',
        )
      if (
        target.updated_at !== form.get('updated_at') ||
        !(await store.updateConfig(id, target.updated_at, {
          ...target.provider_config,
          comparison: { ...config, [field]: occurredOn },
        }))
      )
        throw Error('stale_update')
    } else {
      const note = String(form.get('note') ?? '').trim()
      if (!note || note.length > 1500) throw Error('invalid_comparison')
      await store.insertAudit({
        target_id: id,
        status: 'completed',
        source_url: config.subjectUrl,
        methodology_version: COMPARISON_EVENT_METHOD,
        summary: note,
        scores: {},
        evidence: { occurredOn, recordedBy: adminSession.user.id },
        coverage: 0,
        confidence: 0,
        completed_at: new Date().toISOString(),
      })
    }
  } catch (error) {
    fail(error, id)
  }
  complete(id, 'Maßnahme oder Paketbeginn dokumentiert.')
}
