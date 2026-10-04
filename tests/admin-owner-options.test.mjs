import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import adminData from "../lib/admin-data.ts"

const { createClient } = createRequire(import.meta.url)("@supabase/supabase-js")
const { getDashboardData } = adminData

function ownerDatabase({ hasPartnerFlag = true, ownerError } = {}) {
  const ownerRequests = []
  const owner = {
    id: "owner-1",
    email: "owner@example.invalid",
    display_name: "Synthetic Owner",
    ...(hasPartnerFlag ? { is_partner: true } : {}),
  }
  const client = createClient("https://database.example.test", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const endpoint = new URL(input)
        if (endpoint.pathname === "/rest/v1/users") {
          ownerRequests.push(endpoint)
          if (ownerError) return Response.json(ownerError, { status: 403 })

          const columns = endpoint.searchParams.get("select").split(",")
          const missingColumn = columns.find((column) => !Object.hasOwn(owner, column))
          if (missingColumn) {
            return Response.json({
              code: "42703",
              details: null,
              hint: null,
              message: `column users.${missingColumn} does not exist`,
            }, { status: 400 })
          }
          return Response.json([Object.fromEntries(columns.map((column) => [column, owner[column]]))])
        }

        return Response.json(endpoint.pathname === "/rest/v1/partners" ? [{
          id: "partner-1",
          name: "Synthetic Business",
          owner_id: "owner-1",
          city_id: null,
        }] : [])
      },
    },
  })
  return { client, ownerRequests }
}

test("canonical users schema loads owners and their partner email with one request", async () => {
  const db = ownerDatabase()
  const dashboard = await getDashboardData(db.client)

  assert.deepEqual(dashboard.owners, [{
    id: "owner-1",
    email: "owner@example.invalid",
    display_name: "Synthetic Owner",
    is_partner: true,
  }])
  assert.equal(dashboard.partners[0].owner_email, "owner@example.invalid")
  assert.deepEqual(dashboard.errors, [])
  assert.equal(db.ownerRequests.length, 1)
})

test("older users schema can omit the optional partner flag without losing owner data", async () => {
  const db = ownerDatabase({ hasPartnerFlag: false })
  const dashboard = await getDashboardData(db.client)

  assert.deepEqual(dashboard.owners, [{
    id: "owner-1",
    email: "owner@example.invalid",
    display_name: "Synthetic Owner",
  }])
  assert.equal(dashboard.partners[0].owner_email, "owner@example.invalid")
  assert.deepEqual(dashboard.errors, [])
  assert.equal(db.ownerRequests.length, 2)
})

test("owner permission failures are reported without retrying schema projections", async () => {
  const db = ownerDatabase({ ownerError: {
    code: "42501", details: null, hint: null, message: "permission denied for table users",
  } })
  const dashboard = await getDashboardData(db.client)

  assert.deepEqual(dashboard.owners, [])
  assert.deepEqual(dashboard.errors, ["permission denied for table users"])
  assert.equal(db.ownerRequests.length, 1)
})
