import type {AdminEditorialRequest} from '@/lib/partners/crm'
import type {BenefitPlan} from '@/lib/partners/benefits'
import type { SupabaseClient } from '@supabase/supabase-js'
export type Entitlements = {
  schema_version: number
  capability_policy_version?: number
  deal_drop_limit_provisional?: boolean
  partner_id: string
  role: string
  plan_code: string
  plan_version: number
  offer_code: string | null
  state: string
  valid_until: string | null
  version: string
  features: Record<string, boolean>
  limits: Record<string, number | null>
  reason_codes: Record<string, string>
}
export type PriceOffer = {
  offer_code: string
  version: number
  plan_code: string | null
  plan_version: number | null
  addon_code: string | null
  unit_amount: number
  setup_amount: number
  currency: string
  billing_interval: string
  tax_behavior: string
  status: string
}
export type BillingSummary = {
  schema_version: number
  entitlements: Entitlements
  subscription: null | {
    state: string
    source: string
    period_start: string
    period_end: string
    paid_through: string | null
    trial_end: string | null
    first_payment_at: string | null
    cancel_at_period_end: boolean
    payment_status: string
    activated_at?: string | null
    paid_minimum_end?: string | null
    cancellation_at?: string | null
    grace_until?: string | null
    offer: PriceOffer | null
  }
  founder_activation_review?: {required:true} | null
  founder_readiness?: boolean
  pending_founder?: {recovery_required:boolean;offer_code:string;planned_activation:string|null;trial_end:string|null;paid_minimum_end:string|null} | null
  founder_cancellation?: {requested_at:string;effective_at:string;billing_review_required:boolean} | null
  billing_recovery?: {pending:boolean;status:string;created_at:string} | null
  billing_readiness?: {enabled:boolean;reason:string}
  addons?: {offer_code:string;state:string;valid_until:string;cancel_at_period_end:boolean}[]
  feature_exceptions?: {
    feature_key: string
    effect: string
    source: string
    valid_until: string
  }[]
  usage: {
    period_start: string
    period_end: string
    used: number
    reserved: number
  }[]
  catalog: { schema_version: number; offers: PriceOffer[]; plans?: (BenefitPlan & {version:number})[] }
}
export type PlanPanel = BillingSummary & {
  editorial_requests?: AdminEditorialRequest[]
  billing_cases?: {contract_id:string;state:string;checkout_id:string|null;schedule_id:string|null;subscription_id:string|null;provider_evidence:unknown[]}[]
  founder?: {campaign_city_id:string|null;campaign_city_name:string|null;eligible:boolean;evidence:string|null;decided_at:string|null;admitted:boolean}
  overrides: {
    feature_key: string
    effect: string
    limit_value: number | null
    source: string
    reason: string
    valid_until: string
  }[]
  audit: {
    created_at: string
    source: string
    reason: string
    object_type: string
  }[]
  drafts: {
    id: string
    kind: string
    payload: Record<string, unknown>
    status: string
  }[]
  plans: {
    plan_code: string
    version: number
    features: Record<string, boolean>
    limits: Record<string, number | null>
  }[]
  archives: { kind: string; code: string; version: number }[]
}
export async function readEntitlements(
  client: SupabaseClient,
  partnerId: string,
): Promise<Entitlements> {
  const { data, error } = await client.rpc('get_partner_entitlements', {
    p_partner_id: partnerId,
  })
  if (
    error ||
    !data ||
    data.partner_id !== partnerId ||
    data.schema_version !== 1 ||
    typeof data.role !== 'string' || !data.role.trim() ||
    !data.features || typeof data.features !== 'object' || Array.isArray(data.features) ||
    Object.values(data.features).some(value => typeof value !== 'boolean')
  )
    throw new Error(error?.message ?? 'Rechte konnten nicht geladen werden.')
  return data
}
export function canManageProfile(rights: Entitlements) {
  return (
    rights.role === 'benefitsi_admin' ||
    rights.role === 'owner' ||
    (rights.role === 'admin' && rights.plan_code === 'pro')
  )
}
export async function readBilling(
  client: SupabaseClient,
  partnerId: string,
  admin = false,
): Promise<BillingSummary | PlanPanel> {
  const { data, error } = await client.rpc(
    admin ? 'admin_get_partner_plan_panel' : 'get_partner_billing_summary',
    { p_partner_id: partnerId },
  )
  if (error || !data || data.entitlements?.partner_id !== partnerId)
    throw new Error(
      error?.message ?? 'Tarifdaten konnten nicht geladen werden.',
    )
  return data
}
export async function setEntitlementOverride(
  client: SupabaseClient,
  input: {
    partnerId: string
    feature: string
    mode: string
    reason: string
    until?: string
    limit?: number
  },
) {
  if (!input.reason.trim()) throw new Error('Bitte einen Grund angeben.')
  const args = {
    p_partner_id: input.partnerId,
    p_feature_key: input.feature,
    p_reason: input.reason.trim(),
  }
  if (!['standard', 'allow', 'deny', 'limit'].includes(input.mode))
    throw new Error('Ungültige Auswahl.')
  if (
    input.mode !== 'standard' &&
    (!input.until ||
      !Number.isFinite(Date.parse(input.until)) ||
      Date.parse(input.until) <= Date.now())
  )
    throw new Error('Bitte ein zukünftiges Ablaufdatum angeben.')
  const { error } =
    input.mode === 'standard'
      ? await client.rpc('admin_clear_partner_entitlement_override', args)
      : await client.rpc('admin_set_partner_entitlement_override', {
          ...args,
          p_effect: input.mode,
          p_valid_until: input.until,
          p_limit_value: input.mode === 'limit' ? input.limit : null,
        })
  if (error) throw new Error(error.message)
}
export const featureLabels: Record<string, string> = {
  'microsite.publish': 'Eigene Microsite',
  'media.rich': 'Erweiterte Medien',
  'analytics.basic': 'Basisstatistik',
  'analytics.advanced': 'Erweiterte Statistik',
  'analytics.export': 'Statistikexport',
  'feedback.manage': 'Besuchsfeedback verwalten',
  'marketing.manage': 'Marketingentwürfe · Versand noch nicht verfügbar',
  'crm.manage': 'Kundenbindung · Zielgruppen & Entwürfe',
  'team.manage': 'Team verwalten',
  'menu.ai_import': 'Menüimport mit KI',
  commerce: 'Bestellungen & Termine',
  'seo.monitor': 'SEO-Monitoring',
}
export const limitLabels: Record<string, string> = {
  deal_drops_monthly: 'Deal Drops je Kalendermonat',
  team_members: 'Teammitglieder',
  analytics_days: 'Statistiktage',
  menu_ai_imports_monthly: 'KI-Importe je Zeitraum',
}

export type DealDropUsage = {
  schema_version: 1; partner_id: string; timezone: 'Europe/Berlin';
  month_start: string; used: number; limit: number | null; remaining: number | null;
  resets_at: string; next_available_at: string | null; provisional: boolean;
}
export async function readDealDropUsage(client: SupabaseClient, partnerId: string): Promise<DealDropUsage> {
  const { data, error } = await client.rpc('get_partner_deal_drop_usage', { p_partner_id: partnerId })
  const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
  const calendarDate = (value: string) => {
    const date = new Date(`${value}T00:00:00Z`)
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  }
  const timestamp = (value: unknown): value is string => typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) &&
    calendarDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value))
  const required = ['schema_version', 'partner_id', 'timezone', 'month_start', 'used', 'limit', 'remaining', 'resets_at', 'next_available_at', 'provisional']
  if (error) throw new Error(error.message)
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      !required.every(key => Object.hasOwn(data, key)) ||
      data.schema_version !== 1 || data.partner_id !== partnerId || data.timezone !== 'Europe/Berlin' ||
      typeof data.month_start !== 'string' || !/^\d{4}-\d{2}-01$/.test(data.month_start) || !calendarDate(data.month_start) ||
      !count(data.used) || !(data.limit === null || count(data.limit)) ||
      !(data.remaining === null || count(data.remaining)) || typeof data.provisional !== 'boolean' ||
      !timestamp(data.resets_at) || !(data.next_available_at === null || timestamp(data.next_available_at)))
    throw new Error('Drop-Verbrauch konnte nicht geladen werden.')
  const expectedRemaining = data.limit === null ? null : Math.max(data.limit - data.used, 0)
  const exhausted = expectedRemaining === 0
  if (data.remaining !== expectedRemaining || (exhausted
      ? data.next_available_at === null || data.next_available_at !== data.resets_at
      : data.next_available_at !== null))
    throw new Error('Drop-Verbrauch konnte nicht geladen werden.')
  return data
}
export function canManageFeedback(rights: Entitlements) {
  if (typeof rights.features?.['feedback.manage'] !== 'boolean')
    throw new Error('Feedback-Rechte konnten nicht geladen werden.')
  return canManageProfile(rights) && rights.features?.['feedback.manage'] === true
}
