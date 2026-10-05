'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin'
import { memoryErrorMessage, parseMemoryStampInput, type MemorySaveResult } from '@/lib/city-pages/memory-stamps'
import { refreshPublicCity } from '@/lib/city-pages/public-revalidation'

export async function saveMemoryStamp(value: unknown): Promise<MemorySaveResult> {
  const { supabase } = await requireAdmin()
  const parsed = parseMemoryStampInput(value)
  if (!parsed.ok) return parsed
  const { citySlug, ...input } = parsed.input
  // The caller's authenticated session reaches the database admin check.
  // No service-role key or browser-supplied approval identity is used here.
  const result = await supabase.rpc('admin_save_city_memory_stamp', { p_city_slug: citySlug, p_input: input })
  if (result.error) return { ok: false, message: memoryErrorMessage(result.error.message) }
  const saved = result.data as { id: string; city_id: string; city_slug: string } | null
  if (!saved?.id || !saved.city_id || saved.city_slug !== citySlug) return { ok: false, message: 'Die Speicherbestätigung fehlt. Bitte vor einem erneuten Versuch die Seite neu laden.' }
  const refresh = await refreshPublicCity(saved.city_slug, saved.city_id)
  revalidatePath(`/city-pages/${citySlug}/memory-stamps`)
  revalidatePath(`/city-pages/${citySlug}`)
  return { ok: true, id: saved.id, refresh }
}
