import type { SupabaseClient } from '@supabase/supabase-js'
import { validateSeoFetchUrl } from './seo-url-policy'
import type { SeoTarget } from './seo-data'
import type {
  GoogleMeasurement,
  MeasurementProvider,
} from './seo-google-measurements'

export const SEO_PROVIDERS = {
  google: {
    label: 'Google Business Profile',
    onboarding: 'https://www.google.com/business/',
    action:
      'Berechtigung für persönlichen Kundenkontakt prüfen, Profil beanspruchen und die von Google angebotene Verifizierung abschließen.',
    hosts: [
      'google.com',
      'www.google.com',
      'google.de',
      'www.google.de',
      'maps.google.com',
      'g.page',
      'maps.app.goo.gl',
    ],
  },
  apple: {
    label: 'Apple Business',
    onboarding: 'https://business.apple.com/',
    action:
      'Unternehmen in Apple Business prüfen lassen. Für Benefitsi als Agentur sind Organisationsprüfung und Partner-API-Zulassung eigene Schritte; danach delegiert jeder Kunde seine Marke oder Standorte ausdrücklich.',
    hosts: ['maps.apple.com'],
  },
  bing: {
    label: 'Bing Places',
    onboarding: 'https://www.bing.com/forbusiness/',
    action:
      'Vorhandenen Unternehmenseintrag suchen oder anlegen und die Inhaberschaft bei Bing bestätigen.',
    hosts: ['bing.com', 'www.bing.com', 'binged.it'],
  },
  yelp: {
    label: 'Yelp',
    onboarding: 'https://biz.yelp.de/',
    action:
      'Passenden Unternehmenseintrag suchen, beanspruchen und öffentliche Kontaktdaten manuell prüfen.',
    hosts: ['yelp.de', 'www.yelp.de', 'yelp.com', 'www.yelp.com'],
  },
  gelbe_seiten: {
    label: 'Gelbe Seiten',
    onboarding: 'https://www.gelbeseiten.de/',
    action:
      'Unternehmen suchen und die Option für einen kostenlosen Grundeintrag bzw. eine Korrektur prüfen. Keine Zusatzprodukte bestellen.',
    hosts: ['gelbeseiten.de', 'www.gelbeseiten.de'],
  },
} as const
export type ProfileProvider = keyof typeof SEO_PROVIDERS
export type SeoSetup = {
  business: Partial<
    Record<'name' | 'address' | 'phone' | 'description' | 'website', string>
  >
  businessConfirmed: boolean
  profiles: Partial<
    Record<
      ProfileProvider,
      {
        url: string
        ownershipConfirmed: boolean
        eligibilityConfirmed: boolean
        checked: boolean
        status: 'prepared' | 'manually_checked'
      }
    >
  >
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('invalid_setup')
  return value as Record<string, unknown>
}
function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw Error('invalid_setup')
}
function bounded(value: unknown, max: number): string {
  if (value === undefined) return ''
  if (
    typeof value !== 'string' ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw Error('invalid_setup')
  return value.trim()
}
function publicUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw Error('invalid_url')
  }
  if (
    !validateSeoFetchUrl(value).ok ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !url.hostname.includes('.') ||
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname) ||
    /[\[\]:]/.test(url.hostname)
  )
    throw Error('invalid_url')
  for (const key of url.searchParams.keys())
    if (
      ![
        'q',
        'cid',
        'place_id',
        'll',
        'address',
        'auid',
        'cp',
        'lvl',
        'style',
        'sp',
        'osid',
      ].includes(key)
    )
      throw Error('invalid_url')
  return url
}
export function validateSeoSetup(value: unknown): SeoSetup {
  const input = record(value)
  onlyKeys(input, ['business', 'businessConfirmed', 'profiles'])
  if (typeof input.businessConfirmed !== 'boolean') throw Error('invalid_setup')
  const business = record(input.business ?? {})
  onlyKeys(business, ['name', 'address', 'phone', 'description', 'website'])
  const output: SeoSetup = {
    business: {},
    businessConfirmed: input.businessConfirmed,
    profiles: {},
  }
  for (const key of [
    'name',
    'address',
    'phone',
    'description',
    'website',
  ] as const) {
    const text = bounded(
      business[key],
      key === 'description' ? 2000 : key === 'website' ? 2048 : 500,
    )
    if (text)
      output.business[key] = key === 'website' ? publicUrl(text).href : text
  }
  const profiles = record(input.profiles ?? {})
  onlyKeys(profiles, Object.keys(SEO_PROVIDERS))
  for (const key of Object.keys(profiles) as ProfileProvider[]) {
    const profile = record(profiles[key])
    onlyKeys(profile, [
      'url',
      'ownershipConfirmed',
      'eligibilityConfirmed',
      'checked',
      'status',
    ])
    const urlText = bounded(profile.url, 2048)
    if (urlText) {
      const url = publicUrl(urlText)
      if (
        !(SEO_PROVIDERS[key].hosts as readonly string[]).includes(url.hostname)
      )
        throw Error('invalid_provider_url')
      if (
        key === 'google' &&
        /^(www\.)?google\.(com|de)$/.test(url.hostname) &&
        !url.pathname.startsWith('/maps')
      )
        throw Error('invalid_provider_url')
    }
    for (const field of [
      'ownershipConfirmed',
      'eligibilityConfirmed',
      'checked',
    ])
      if (typeof profile[field] !== 'boolean') throw Error('invalid_setup')
    if (
      profile.checked &&
      (!urlText ||
        !input.businessConfirmed ||
        !profile.ownershipConfirmed ||
        !profile.eligibilityConfirmed)
    )
      throw Error('confirmation_required')
    output.profiles[key] = {
      url: urlText,
      ownershipConfirmed: profile.ownershipConfirmed as boolean,
      eligibilityConfirmed: profile.eligibilityConfirmed as boolean,
      checked: profile.checked as boolean,
      status: profile.checked ? 'manually_checked' : 'prepared',
    }
  }
  return output
}
export type SeoStore = {
  getTarget(id: string): Promise<SeoTarget | null>
  updateConfig(
    id: string,
    updatedAt: string,
    config: Record<string, unknown>,
  ): Promise<boolean>
  insertAudit(row: Record<string, unknown>): Promise<void>
}
export type AuthorizeSeo = () => Promise<SeoStore>
function targetId(value: string) {
  if (!value || value.length > 100) throw Error('invalid_target')
  return value
}
export async function saveSeoSetup(
  authorize: AuthorizeSeo,
  id: string,
  version: string,
  input: unknown,
) {
  const store = await authorize()
  const target = await store.getTarget(targetId(id))
  if (!target) throw Error('target_missing')
  if (!['domain', 'partner_microsite'].includes(target.target_type))
    throw Error('profile_setup_unavailable')
  if (target.updated_at !== version) throw Error('stale_update')
  const setup = validateSeoSetup(input)
  if (
    !(await store.updateConfig(target.id, version, {
      ...target.provider_config,
      setup,
    }))
  )
    throw Error('stale_update')
}
export async function runSeoMeasurement(
  authorize: AuthorizeSeo,
  id: string,
  provider: MeasurementProvider,
  measure: (target: SeoTarget) => Promise<GoogleMeasurement>,
) {
  const store = await authorize()
  const target = await store.getTarget(targetId(id))
  if (!target || target.status !== 'active') throw Error('invalid_target')
  if (provider !== 'gsc' && provider !== 'psi') throw Error('invalid_provider')
  const startedAt = new Date().toISOString()
  const result = await measure(target)
  const partial = ['no_data', 'unconfigured', 'partial'].includes(result.state)
  await store.insertAudit({
    target_id: target.id,
    status:
      result.state === 'ok' ? 'completed' : partial ? 'partial' : 'failed',
    source_url: target.canonical_url,
    methodology_version: 'benefitsi-google-measurement-v1',
    summary: `${result.source}: ${result.state}`,
    scores: {},
    evidence: result,
    coverage: result.state === 'ok' ? 1 : result.state === 'partial' ? 0.5 : 0,
    confidence: result.state === 'ok' || result.state === 'partial' ? 1 : 0,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  })
  return result.state
}

export function createSeoStore(supabase: SupabaseClient): SeoStore {
  return {
    async getTarget(id) {
      const result = await supabase
        .from('seo_targets')
        .select(
          'id,canonical_url,target_type,partner_id,city_id,status,provider_config,updated_at',
        )
        .eq('id', id)
        .maybeSingle()
      if (result.error) throw Error('storage_error')
      return result.data as SeoTarget | null
    },
    async updateConfig(id, version, config) {
      const result = await supabase
        .from('seo_targets')
        .update({
          provider_config: config,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('updated_at', version)
        .select('id')
      if (result.error) throw Error('storage_error')
      return result.data?.length === 1
    },
    async insertAudit(row) {
      const result = await supabase.from('seo_audit_runs').insert(row)
      if (result.error) throw Error('storage_error')
    },
  }
}

export function publicSeoTarget(target: SeoTarget): SeoTarget {
  let setup: SeoSetup | undefined
  try {
    setup = validateSeoSetup(target.provider_config?.setup)
  } catch {
    /* Only validated public fields cross into the client. */
  }
  return { ...target, provider_config: setup ? { setup } : {} }
}
