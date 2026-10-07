import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"
import { MicrositePublicationSummary } from "../components/microsite/publication-summary.tsx"
import { micrositeVersions } from "../lib/microsite-workflow.ts"

// Evaluate the actual UI expressions with an archived parent that retains its
// published version for future edits. No database state is rewritten for UI.
const source = readFileSync(new URL("../app/microsite-panel.tsx", import.meta.url), "utf8")
const file = ts.createSourceFile("panel.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const fn = name => file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
const variable = (functionNode, name) => functionNode.body.statements.filter(ts.isVariableStatement)
  .flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(file) === name)
const workflow = fn("WorkflowPanel")
const declaration = node => variable(node, "isPublished") ? `const ${variable(node, "isPublished").getText(file)};` : ""
const publicUrl = "https://benefitsi.de/partner/synthetic"
const Header = partner => {
  const versions = micrositeVersions(partner.microsite)
  return React.createElement(MicrositePublicationSummary, { saved: versions.editable, published: versions.published, dirty: false, publicUrl })
}
const workflowState = new Function("partner", "report", `${declaration(workflow)} return ${variable(workflow, "steps").initializer.getText(file).replace(/ as const$/, "")};`)
for (const status of ["archived", "draft", "review", "approved", "published"]) {
  test(`publication UI reports actual parent state ${status} while retaining saved version`, () => {
    const partner = { microsite: { status, publishedVersion: { id: "saved-public-version" } } }
    const expectedLive = status === "published"
    const html = renderToStaticMarkup(Header(partner))
    assert.equal(html.includes(`href="${publicUrl}"`), expectedLive, html)
    assert.equal(workflowState(partner, { items: [] }).at(-1)[2], expectedLive)
    assert.equal(partner.microsite.publishedVersion.id, "saved-public-version")
  })
}
test("published parent without a loaded version is not presented as live", () => {
  const partner = { microsite: { status: "published", publishedVersion: null } }
  assert.equal(renderToStaticMarkup(Header(partner)).includes(`href="${publicUrl}"`), false)
  assert.equal(workflowState(partner, { items: [] }).at(-1)[2], false)
})
