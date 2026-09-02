import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import test from "node:test"

const shellUrl = new URL("../app/admin-shell.tsx", import.meta.url)
const adminUrl = new URL("../app/partner-admin.tsx", import.meta.url)
const actionsUrl = new URL("../app/partner-actions.ts", import.meta.url)
const languageUrl = new URL("../app/admin-language.tsx", import.meta.url)
const menuApprovalsPageUrl = new URL(
  "../app/menu-approvals/page.tsx",
  import.meta.url,
)

test("admin no longer exposes the obsolete menu approval workflow", async () => {
  const [shell, admin, actions, language] = await Promise.all([
    readFile(shellUrl, "utf8"),
    readFile(adminUrl, "utf8"),
    readFile(actionsUrl, "utf8"),
    readFile(languageUrl, "utf8"),
  ])

  assert.doesNotMatch(shell, /menu-approvals|Menu approvals|MenuApprovalIcon/)
  assert.doesNotMatch(
    admin,
    /Menu approvals required|MenuApproval|Menu approval|Needs review|awaiting approval|Approve menu/,
  )
  assert.doesNotMatch(
    actions,
    /approveMenu|revalidatePath\(["']\/menu-approvals["']\)/,
  )
  assert.doesNotMatch(
    language,
    /Menu approvals required|Menu approvals|Menu approval status|Needs review|Review queue|Approve menu|awaiting approval/,
  )
  await assert.rejects(access(menuApprovalsPageUrl), { code: "ENOENT" })
})

test("partner menu publication is not forced into review", async () => {
  const [actions, admin] = await Promise.all([
    readFile(actionsUrl, "utf8"),
    readFile(adminUrl, "utf8"),
  ])

  assert.doesNotMatch(
    actions,
    /payload\.status\s*===\s*["']published["'][\s\S]{0,120}payload\.status\s*=\s*["']review["']/,
  )
  assert.match(admin, /label="Menu status"/)
  assert.doesNotMatch(admin, /label="Menu approval status"/)
  assert.doesNotMatch(admin, /value:\s*["']review["']\s*,\s*label:\s*["']Needs review["']/)
})
