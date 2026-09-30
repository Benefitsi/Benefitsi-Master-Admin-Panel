'use server'
import { revalidatePath } from 'next/cache'
import {
  berlinMidnight,
  dashboardWindow,
  readDashboard,
} from '@/lib/partners/analytics'
import { requireAdmin } from '@/lib/admin'
import {
  readBilling,
  setEntitlementOverride,
  type PlanPanel,
} from '@/lib/partners/entitlements'
export async function loadPartnerPlanPanel(
  partnerId: string,
): Promise<PlanPanel> {
  const { supabase } = await requireAdmin()
  return (await readBilling(supabase, partnerId, true)) as PlanPanel
}
export async function updatePartnerPlan(
  _previous: { ok: boolean; message: string },
  form: FormData,
) {
  try {
    const { supabase } = await requireAdmin()
    const value = (name: string) => String(form.get(name) ?? '').trim()
    const operation = value('operation'),
      partner = value('partner_id'),
      reason = value('reason')
    if (!reason) throw new Error('reason_required')
    if (operation === 'override')
      await setEntitlementOverride(supabase, {
        partnerId: partner,
        feature: value('feature'),
        mode: value('mode'),
        reason,
        until: value('valid_until')
          ? berlinMidnight(value('valid_until'))
          : undefined,
        limit: Number(value('limit')),
      })
    else {
      let rpc = '',
        args: Record<string, unknown> = {}
      if (operation === 'founder_eligibility') {
        if(!['true','false'].includes(value('eligible'))) throw new Error('decision_required')
        rpc='admin_set_partner_founder_eligibility'
        args={p_partner_id:partner,p_city_id:value('city_id'),p_evidence:reason,p_eligible:value('eligible')==='true'}
      } else if (operation === 'grant') {
        rpc = 'admin_grant_partner_plan'
        args = {
          p_partner_id: partner,
          p_plan_code: 'pro',
          p_plan_version: Number(value('plan_version')),
          p_valid_until: berlinMidnight(value('valid_until'))
            ? berlinMidnight(value('valid_until'))
            : undefined,
          p_reason: reason,
        }
      } else if (operation === 'draft_offer') {
        rpc = 'admin_save_partner_catalog_draft'
        const addon = value('offer_code')
        args = {
          p_kind: 'offer',
          p_reason: reason,
          p_payload: {
            offer_code: addon,
            version: Number(value('version')),
            unit_amount: Math.round(Number(value('amount')) * 100),
            setup_amount: Math.round(Number(value('setup')) * 100),
            ...(addon === 'commerce' || addon === 'seo'
              ? { addon_code: addon === 'seo' ? 'seo.monitor' : addon }
              : {
                  plan_code: 'pro',
                  plan_version: Number(value('plan_version')),
                }),
          },
        }
      } else if (operation === 'draft_plan') {
        rpc = 'admin_save_partner_catalog_draft'
        const features = Object.fromEntries(
          [
            'microsite.publish',
            'media.rich',
            'analytics.basic',
            'analytics.advanced',
            'analytics.export',
            'team.manage',
            'menu.ai_import',
            'commerce',
            'seo.monitor',
          ].map((key) => [key, form.get(key) === 'on']),
        )
        const limits = Object.fromEntries(
          [
            'active_offers',
            'team_members',
            'analytics_days',
            'menu_ai_imports_monthly',
          ].map((key) => [key, Number(value(key))]),
        )
        args = {
          p_kind: 'plan',
          p_reason: reason,
          p_payload: {
            plan_code: value('plan_code'),
            version: Number(value('version')),
            features,
            limits,
          },
        }
      } else if (operation === 'publish') {
        rpc = 'admin_publish_partner_catalog_draft'
        args = { p_draft_id: value('draft_id'), p_reason: reason }
      } else if (operation === 'archive') {
        rpc = 'admin_archive_partner_catalog_version'
        args = {
          p_kind: value('kind'),
          p_code: value('code'),
          p_version: Number(value('version')),
          p_reason: reason,
        }
      } else throw new Error('invalid_operation')
      const { error } = await supabase.rpc(rpc, args)
      if (error) throw new Error(error.message)
    }
    revalidatePath('/')
    revalidatePath('/partner', 'layout')
    return {
      ok: true,
      message: 'Gespeichert. Die wirksamen Rechte wurden aktualisiert.',
    }
  } catch {
    return {
      ok: false,
      message:
        'Änderung nicht gespeichert. Bitte Berechtigung, Grund, Ablaufdatum und Versionsnummer prüfen. Bestehende Abos dürfen nicht durch Testfreigaben ersetzt werden.',
    }
  }
}

export async function loadPartnerDashboardPreview(partnerId: string) {
  const { supabase } = await requireAdmin()
  return readDashboard(supabase, partnerId, dashboardWindow('last7'))
}
