import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AdminLanguageProvider } from "../app/admin-language.tsx"

test("date and currency leaves render original values in both selected locales", async () => {
  const { AdminDate, AdminNumber } = await import("../components/admin-format.tsx")
  for (const [language, date, amount] of [["de", "09.10.2026", "1.234,50"], ["en", "09/10/2026", "1,234.50"]]) {
    const output = renderToStaticMarkup(React.createElement(AdminLanguageProvider, { initialLanguage: language },
      React.createElement(AdminDate, { value: "2026-10-09T12:00:00Z", options: { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" } }),
      React.createElement(AdminNumber, { value: 1234.5, options: { style: "currency", currency: "EUR" } })))
    assert.ok(output.includes(date), output)
    assert.ok(output.includes(amount), output)
  }
})
