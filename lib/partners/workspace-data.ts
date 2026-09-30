import type { SupabaseClient } from '@supabase/supabase-js'
import type { PartnerWithDeals, City } from '@/lib/admin-data'
import { canManageProfile, readEntitlements } from './entitlements'
// Scoped manual-management data only. No customer activity or raw analytics reads.
export async function readPartnerWorkspace(
  client: SupabaseClient,
  partnerId: string,
) {
  const rights = await readEntitlements(client, partnerId)
  if (!canManageProfile(rights))
    throw new Error('Keine Berechtigung zur Betriebsverwaltung.')
  const [
    partner,
    cities,
    deals,
    holidays,
    socials,
    rewards,
    staff,
    hours,
    menus,
    microsite,
  ] = await Promise.all([
    client.from('partners').select('*').eq('id', partnerId).single(),
    client.from('cities').select('id,name,slug').order('name'),
    client.from('deals').select('*').eq('partner_id', partnerId),
    client.from('partner_holidays').select('*').eq('partner_id', partnerId),
    client.from('partner_socials').select('*').eq('partner_id', partnerId),
    client
      .from('partner_reward_milestones')
      .select('*')
      .eq('partner_id', partnerId),
    rights.features['team.manage']
      ? client.rpc('get_partner_team_members', { p_partner_id: partnerId })
      : Promise.resolve({ data: [], error: null }),
    client
      .from('partner_opening_hours')
      .select('*')
      .eq('partner_id', partnerId),
    client.from('menus').select('*').eq('partner_id', partnerId),
    client
      .from('microsites')
      .select('*')
      .eq('partner_id', partnerId)
      .maybeSingle(),
  ])
  if (
    [
      partner,
      cities,
      deals,
      holidays,
      socials,
      rewards,
      staff,
      hours,
      menus,
      microsite,
    ].some((r) => r.error)
  )
    throw new Error(
      'Betriebsdaten konnten nicht vollständig geladen werden. Bitte erneut versuchen.',
    )
  const menuIds = (menus.data ?? []).map((m) => m.id)
  const [categories, items] = menuIds.length
    ? await Promise.all([
        client.from('menu_categories').select('*').in('menu_id', menuIds),
        client.from('menu_items').select('*').in('menu_id', menuIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ]
  if (categories.error || items.error)
    throw new Error('Menüdaten konnten nicht geladen werden.')
  const record = {
    ...partner.data,
    deals: deals.data ?? [],
    holidays: holidays.data ?? [],
    socials: socials.data ?? [],
    reward_milestones: rewards.data ?? [],
    staff: staff.data ?? [],
    opening_hours: hours.data ?? [],
    menus: (menus.data ?? []).map((menu) => ({
      ...menu,
      categories: (categories.data ?? [])
        .filter((c) => c.menu_id === menu.id)
        .map((c) => ({
          ...c,
          items: (items.data ?? []).filter((i) => i.category_id === c.id),
        })),
      items: (items.data ?? []).filter((i) => i.menu_id === menu.id),
    })),
    microsite: microsite.data
      ? { ...microsite.data, draftVersion: null, publishedVersion: null }
      : null,
    stamp_progress: [],
    visits: [],
    fraud_events: [],
    menu_ai_import_enabled: rights.features['menu.ai_import'] === true,
    team_manage_enabled: rights.features['team.manage'] === true,
  } as PartnerWithDeals
  return { partner: record, cities: (cities.data ?? []) as City[] }
}
