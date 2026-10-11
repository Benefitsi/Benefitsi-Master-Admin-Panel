import assert from "node:assert/strict"
import test from "node:test"
import { partnerSaveFixture, partnerForm, partnerId, ownerId, screenshotSchedule } from "./helpers/partner-save-fixture.mjs"

for (const isAdmin of [true, false]) {
  test(`${isAdmin ? "admin" : "partner"} edit saves social links and 24-hour operating hours through Save partner`, async () => {
    const f = partnerSaveFixture({ isAdmin })
    const result = await f.actions.savePartner({}, partnerForm())
    assert.equal(result.ok, true, result.message)
    assert.equal(f.rpcCalls.length, 1)
    assert.equal(result.savedPartner.socials.length, 2)
    assert.equal(result.savedPartner.socials[1].url, "https://www.youtube.com/channel/UC-test")
    assert.equal(result.savedPartner.opening_hours.length, 7)
    assert.ok(result.savedPartner.opening_hours.every(row => row.opens_at === "00:00:00" && row.closes_at === "00:00:00" && row.is_closed === false && row.id))
    assert.equal(result.savedPartner.owner_id, ownerId)
    if (!isAdmin) assert.equal(result.savedPartner.is_featured, true)
    assert.equal(f.tables.get("partner_socials").length, 2)
    assert.equal(f.tables.get("partner_opening_hours").length, 7)
    assert.ok(!f.writes.some(write => ["partner_socials", "partner_opening_hours", "partner_holidays"].includes(write.table)))
  })

  test(`${isAdmin ? "admin" : "partner"} can add, edit and remove all five social platforms`, async () => {
    const f = partnerSaveFixture({ isAdmin })
    const socials = ["facebook", "instagram", "tiktok", "x", "youtube"].map(platform => [platform, "@benefitsi"])
    assert.equal((await f.actions.savePartner({}, partnerForm({ socials }))).ok, true)
    assert.equal(f.tables.get("partner_socials").length, 5)
    assert.equal((await f.actions.savePartner({}, partnerForm({ socials: [["facebook", "https://www.facebook.com/profile.php?id=12345"]] }))).ok, true)
    assert.equal(f.tables.get("partner_socials")[0].url, "https://www.facebook.com/profile.php?id=12345")
    assert.equal((await f.actions.savePartner({}, partnerForm({ socials: [] }))).ok, true)
    assert.equal(f.tables.get("partner_socials").length, 0)
  })

  test(`${isAdmin ? "admin" : "partner"} saves contact and profile changes together with socials and hours`, async () => {
    const f = partnerSaveFixture({ isAdmin })
    const data = partnerForm()
    for (const [key, value] of Object.entries({ name: "Updated café", short_name: "Updated", description: "Updated description", address: "Updated street 2", phone: "+60123456789", email: "cafe@example.test", website: "https://example.test", coordinates: "50, 9" })) data.set(key, value)
    const result = await f.actions.savePartner({}, data)
    assert.equal(result.ok, true, result.message)
    const stored = f.tables.get("partners")[0]
    for (const key of ["name", "short_name", "description", "address", "phone", "email", "website"]) assert.equal(stored[key], data.get(key))
    assert.deepEqual(JSON.parse(stored.coordinates), { latitude: 50, longitude: 9 })
    assert.equal(stored.owner_id, ownerId)
    assert.deepEqual(Array.from(stored.category), ["Cafe"])
    assert.equal(result.savedPartner.socials.length, 2)
    assert.equal(result.savedPartner.opening_hours.length, 7)
  })

  test(`${isAdmin ? "admin" : "partner"} partial profile saves preserve omitted social and schedule collections`, async () => {
    const f = partnerSaveFixture({ isAdmin })
    const data = partnerForm({ hours: false, holidays: false })
    data.delete("social_count")
    data.delete("social_0_platform"); data.delete("social_0_handle"); data.delete("social_1_platform"); data.delete("social_1_handle")
    const before = structuredClone([...f.tables])
    assert.equal((await f.actions.savePartner({}, data)).ok, true)
    assert.equal(f.rpcCalls.length, 0)
    for (const table of ["partner_socials", "partner_opening_hours", "partner_holidays"]) assert.deepEqual(f.tables.get(table), new Map(before).get(table))
  })

  test(`${isAdmin ? "admin" : "partner"} saves weekly hours without requiring holiday fields and supports 24-hour exceptions`, async () => {
    const f = partnerSaveFixture({ isAdmin })
    const first = await f.actions.savePartner({}, partnerForm({ holidays: false }))
    assert.equal(first.ok, true, first.message)
    assert.equal(f.rpcCalls[0].p_holidays, null)
    assert.equal(f.tables.get("partner_holidays").length, 1)
    const data = partnerForm()
    for (const [key, value] of Object.entries({ holiday_count: "1", holiday_0_date: "2026-12-31", holiday_0_kind: "hours", holiday_0_opens_at: "00:00", holiday_0_closes_at: "00:00", holiday_0_repeats_yearly: "on" })) data.set(key, value)
    const result = await f.actions.savePartner({}, data)
    assert.equal(result.ok, true, result.message)
    assert.equal(result.savedPartner.holidays[0].opens_at, "00:00:00")
    assert.equal(result.savedPartner.holidays[0].repeats_yearly, true)
  })
}

test("admin Add partner creates socials, seven 24-hour days and the starter milestone", async () => {
  const f = partnerSaveFixture()
  const result = await f.actions.savePartner({}, partnerForm({ create: true }))
  assert.equal(result.ok, true, result.message)
  assert.equal(result.created, true)
  assert.notEqual(result.partnerId, partnerId)
  assert.equal(result.savedPartner.socials.length, 2)
  assert.equal(result.savedPartner.opening_hours.length, 7)
  assert.ok(f.tables.get("partner_reward_milestones").some(row => row.partner_id === result.partnerId))
})

test("social validation failures preserve old links and prevent all writes", async () => {
  for (const socials of [[["instagram", ""]], [["instagram", "@a"], ["instagram", "@b"]], [["youtube", "https://example.com/channel"]], [["unknown", "@a"]]]) {
    const f = partnerSaveFixture()
    assert.equal((await f.actions.savePartner({}, partnerForm({ socials }))).ok, false)
    assert.equal(f.rpcCalls.length, 0)
    assert.equal(f.writes.length, 0)
    assert.equal(f.tables.get("partner_socials")[0].handle, "old")
  }
})

test("related save failures keep links and hours, report failure and allow a corrected retry", async () => {
  const f = partnerSaveFixture({ rpcError: "simulated database rejection" })
  const before = structuredClone([...f.tables])
  const result = await f.actions.savePartner({}, partnerForm())
  assert.equal(result.ok, false)
  assert.match(result.message, /simulated database rejection/)
  for (const table of ["partner_socials", "partner_opening_hours", "partner_holidays"]) assert.deepEqual(f.tables.get(table), new Map(before).get(table))
  f.setRpcError(null)
  const retry = await f.actions.savePartner({}, partnerForm())
  assert.equal(retry.ok, true, retry.message)
  assert.equal(retry.savedPartner.socials.length, 2)
  assert.equal(retry.savedPartner.opening_hours.length, 7)
})

test("a holiday-only edit validates dates and hours before updating the partner", async () => {
  const f = partnerSaveFixture()
  const data = partnerForm({ hours: false })
  for (const [key, value] of Object.entries({ holiday_count: "1", holiday_0_date: "2026-12-31", holiday_0_kind: "hours", holiday_0_opens_at: "18:00", holiday_0_closes_at: "18:00" })) data.set(key, value)
  assert.equal((await f.actions.savePartner({}, data)).ok, false)
  assert.equal(f.writes.length, 0)
  assert.equal(f.rpcCalls.length, 0)
})

test("missing session, foreign partner, scanner and forged Add partner requests never write", async () => {
  for (const options of [{ signedIn: false }, { isAdmin: false, allowed: false }, { partnerMissing: true }]) {
    const f = partnerSaveFixture(options)
    assert.equal((await f.actions.savePartner({}, partnerForm())).ok, false)
    assert.equal(f.writes.length, 0)
    assert.equal(f.rpcCalls.length, 0)
  }
  const f = partnerSaveFixture({ isAdmin: false })
  assert.equal((await f.actions.savePartner({}, partnerForm({ create: true }))).ok, false)
  assert.equal(f.writes.length, 0)
})

test("an unconfirmed settings response cannot report a successful partner save", async () => {
  const f = partnerSaveFixture({ badConfirmation: true })
  assert.equal((await f.actions.savePartner({}, partnerForm())).ok, false)
})

test("matching row counts cannot hide incorrect saved operating hours", async () => {
  const f = partnerSaveFixture({ confirmationTransform: data => {
    data.opening_hours[0].opens_at = "09:00:00"
    return data
  } })
  const result = await f.actions.savePartner({}, partnerForm())
  assert.equal(result.ok, false)
  assert.match(result.message, /operating hours could not be confirmed/)
})

for (const [isAdmin, create] of [[true, false], [false, false], [true, true]]) {
  test(`${isAdmin ? "admin" : "partner"} ${create ? "add" : "edit"} saves the exact screenshot schedule and an overnight holiday`, async () => {
    const f = partnerSaveFixture({ isAdmin })
    const data = partnerForm({ create })
    screenshotSchedule.forEach(([opens, closes], day) => {
      data.set(`opens_at_${day + 1}`, opens)
      data.set(`closes_at_${day + 1}`, closes)
    })
    for (const [key, value] of Object.entries({ holiday_count: "1", holiday_0_date: "2026-12-31", holiday_0_kind: "hours", holiday_0_opens_at: "14:00", holiday_0_closes_at: "01:00" })) data.set(key, value)
    const result = await f.actions.savePartner({}, data)
    assert.equal(result.ok, true, result.message)
    result.savedPartner.opening_hours.forEach((row, day) => {
      assert.equal(row.weekday, day + 1)
      assert.equal(row.opens_at.slice(0, 5), screenshotSchedule[day][0])
      assert.equal(row.closes_at.slice(0, 5), screenshotSchedule[day][1])
    })
    assert.equal(result.savedPartner.holidays[0].closes_at, "01:00:00")
    assert.equal(result.savedPartner.socials.length, 2)
  })
}
