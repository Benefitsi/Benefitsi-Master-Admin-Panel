import assert from "node:assert/strict"
import test from "node:test"
import partnerPortal from "../lib/partner-portal.ts"

const {
  canAccessPartner,
  canManagePartner,
  filterPartnersForManagement,
  filterPartnersForPortal,
} = partnerPortal

const staffSession = {
  user: { id: "staff-user" },
  profile: null,
  isAdmin: false,
  isPartner: true,
  partnerIds: ["staff-partner", "owned-partner"],
  ownedPartnerIds: ["owned-partner"],
}

test("linked partner staff can edit their microsite without receiving management access", () => {
  assert.equal(canAccessPartner(staffSession, "staff-partner"), true)
  assert.equal(canManagePartner(staffSession, "staff-partner"), false)
  assert.equal(canManagePartner(staffSession, "owned-partner"), true)
})

test("portal and management partner lists keep their separate scopes", () => {
  const partners = [
    { id: "staff-partner", name: "Staff shop" },
    { id: "owned-partner", name: "Owned shop" },
    { id: "other-partner", name: "Other shop" },
  ]

  assert.deepEqual(
    filterPartnersForPortal(partners, staffSession).map((partner) => partner.id),
    ["staff-partner", "owned-partner"],
  )
  assert.deepEqual(
    filterPartnersForManagement(partners, staffSession).map(
      (partner) => partner.id,
    ),
    ["owned-partner"],
  )
})
