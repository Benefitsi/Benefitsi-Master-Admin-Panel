'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin'
import {
  saveSeoSetup,
  runSeoMeasurement,
  SEO_PROVIDERS,
  createSeoStore,
  type SeoStore,
} from '@/lib/seo/seo-setup'
import { measureGsc, measurePageSpeed } from '@/lib/seo/seo-google-measurements'

async function authorize(): Promise<SeoStore> {
  const { supabase } = await requireAdmin()
  return createSeoStore(supabase)
}
const errors: Record<string, string> = {
  profile_setup_unavailable:
    'Stadt- und redaktionelle Seiten sind keine eigenen Unternehmen. Bitte das Domain- oder Partner-Ziel auswählen.',
  stale_update:
    'Dieses Ziel wurde inzwischen geändert. Bitte neu laden und erneut prüfen.',
  confirmation_required:
    'Für „manuell geprüft“ müssen Unternehmensdaten, Berechtigung und Inhaberschaft bestätigt sein.',
  invalid_setup:
    'Bitte nur öffentliche, gültige Profildaten innerhalb der Feldlängen eingeben.',
  invalid_url:
    'Bitte eine öffentliche HTTPS-URL ohne Zugangsdaten oder geheime Parameter verwenden.',
  invalid_provider_url:
    'Die Profil-URL gehört nicht zum ausgewählten Anbieter.',
  invalid_target: 'Das aktive SEO-Ziel konnte nicht bestätigt werden.',
  target_missing: 'Das SEO-Ziel wurde nicht gefunden.',
}
function errorMessage(error: unknown) {
  return error instanceof Error
    ? (errors[error.message] ??
        'Speichern nicht möglich. Bitte erneut versuchen.')
    : 'Speichern nicht möglich.'
}
export async function saveSeoSetupAction(form: FormData): Promise<void> {
  const store = await authorize()
  const id = String(form.get('target_id') ?? '')
  try {
    const business = Object.fromEntries(
      ['name', 'address', 'phone', 'description', 'website'].map((key) => [
        key,
        String(form.get(key) ?? ''),
      ]),
    )
    const profiles = Object.fromEntries(
      Object.keys(SEO_PROVIDERS).map((key) => [
        key,
        {
          url: String(form.get(`${key}_url`) ?? ''),
          ownershipConfirmed: form.get(`${key}_ownership`) === 'on',
          eligibilityConfirmed: form.get(`${key}_eligibility`) === 'on',
          checked: form.get(`${key}_checked`) === 'on',
        },
      ]),
    )
    await saveSeoSetup(
      async () => store,
      id,
      String(form.get('updated_at') ?? ''),
      {
        business,
        businessConfirmed: form.get('business_confirmed') === 'on',
        profiles,
      },
    )
  } catch (error) {
    redirect(
      `/seo?target=${encodeURIComponent(id)}&error=${encodeURIComponent(errorMessage(error))}`,
    )
  }
  revalidatePath('/seo')
  redirect(`/seo?target=${encodeURIComponent(id)}&setup=1`)
}
export async function runGoogleMeasurementAction(
  form: FormData,
): Promise<void> {
  const store = await authorize()
  const id = String(form.get('target_id') ?? '')
  const provider = form.get('provider')
  try {
    if (provider !== 'gsc' && provider !== 'psi') throw Error('invalid_setup')
    await runSeoMeasurement(
      async () => store,
      id,
      provider,
      provider === 'gsc' ? measureGsc : measurePageSpeed,
    )
  } catch (error) {
    redirect(
      `/seo?target=${encodeURIComponent(id)}&error=${encodeURIComponent(errorMessage(error))}`,
    )
  }
  revalidatePath('/seo')
  redirect(`/seo?target=${encodeURIComponent(id)}&measurement=1`)
}
