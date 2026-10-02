import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTypescript } from './helpers/load-typescript.mjs'

const portal = loadTypescript('lib/partner-portal.ts', { './admin': {}, './supabase/server': {} })
const partnerId = 'owned-partner'
const bookingId = 'owned-booking'
function bookingAccess({ isAdmin = false, managedPartnerIds = [], ownedPartnerIds = [], providerPartnerId = partnerId } = {}) {
  const session = { isAdmin, isPartner: true, partnerIds: [partnerId], managedPartnerIds, ownedPartnerIds }
  const database = {
    booking_providers: [{ id: 'provider', partner_id: providerPartnerId, display_name: 'Shop' }],
    booking_offers: [],
    bookings: [{ id: bookingId, provider_id: 'provider', state: 'confirmed' }],
  }
  const admin = { from(table) {
    let rows = database[table]
    const query = {
      select: () => query,
      in: (column, values) => { rows = rows.filter(row => values.includes(row[column])); return query },
      order: () => query,
      limit: () => query,
      then: resolve => resolve({ data: rows, error: null }),
    }
    return query
  } }
  return loadTypescript('lib/bookings/provider-data.ts', {
    'next/navigation': { redirect: path => { throw Error(`redirect:${path}`) } },
    '@/lib/partner-portal': { ...portal, getPartnerPortalSession: async () => session },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/supabase/server': { createClient: async () => ({}) },
  })
}

test('read-only partner manager can inspect bookings but cannot request cancellation', async () => {
  const access = bookingAccess()
  assert.equal((await access.requireProviderBookingContext()).bookings[0].id, bookingId)
  await assert.rejects(() => access.requireProviderBooking(bookingId), /Bearbeitungsberechtigung/)
})

test('owners, entitled managers and admins may mutate only an accessible booking', async () => {
  for (const role of [
    { ownedPartnerIds: [partnerId], managedPartnerIds: [partnerId] },
    { managedPartnerIds: [partnerId] },
    { isAdmin: true },
  ]) {
    const access = bookingAccess(role)
    assert.equal((await access.requireProviderBooking(bookingId)).booking.id, bookingId)
    await assert.rejects(() => access.requireProviderBooking('foreign-booking'), /gehört nicht/)
  }
})

test('admin retains mutation access to a provider without a linked partner', async () => {
  const access = bookingAccess({ isAdmin: true, providerPartnerId: null })
  assert.equal((await access.requireProviderBooking(bookingId)).booking.id, bookingId)
})
