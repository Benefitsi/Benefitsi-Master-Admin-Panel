import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"

// Evaluate the actual UI expressions with an archived parent that retains its
// published version for future edits. No database state is rewritten for UI.
const source = readFileSync(new URL("../app/microsite-panel.tsx", import.meta.url), "utf8")
const file = ts.createSourceFile("panel.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const fn = name => file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
const variable = (functionNode, name) => functionNode.body.statements.filter(ts.isVariableStatement)
  .flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(file) === name)
const panel = fn("MicrositePanel"), workflow = fn("WorkflowPanel")
let badge
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === "StatusBadge" && node.getText(file).includes('"Live"')) badge = node
  ts.forEachChild(node, visit)
}
visit(panel)
assert.ok(badge)
const declaration = node => variable(node, "isPublished") ? `const ${variable(node, "isPublished").getText(file)};` : ""
const compiled = ts.transpileModule(`function Header(partner) { ${declaration(panel)} return ${badge.getText(file)}; }`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText
const Header = new Function("React", "StatusBadge", compiled + ";return Header")(React, ({ label, active }) => React.createElement("span", { "data-live": String(active) }, label))
const workflowState = new Function("partner", "report", `${declaration(workflow)} return ${variable(workflow, "steps").initializer.getText(file).replace(/ as const$/, "")};`)
for (const status of ["archived", "draft", "review", "approved", "published"]) {
  test(`publication UI reports actual parent state ${status} while retaining saved version`, () => {
    const partner = { microsite: { status, publishedVersion: { id: "saved-public-version" } } }
    const expectedLive = status === "published"
    const html = renderToStaticMarkup(Header(partner))
    assert.ok(html.includes(`data-live="${expectedLive}"`), html)
    assert.ok(html.includes(expectedLive ? ">Live<" : ">Noch nicht live<"), html)
    assert.equal(workflowState(partner, { items: [] }).at(-1)[2], expectedLive)
    assert.equal(partner.microsite.publishedVersion.id, "saved-public-version")
  })
}
test("published parent without a loaded version is not presented as live", () => {
  const partner = { microsite: { status: "published", publishedVersion: null } }
  assert.ok(renderToStaticMarkup(Header(partner)).includes('data-live="false"'))
  assert.equal(workflowState(partner, { items: [] }).at(-1)[2], false)
})
