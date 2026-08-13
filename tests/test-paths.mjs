import { constants } from "node:fs"
import { access } from "node:fs/promises"
import { fileURLToPath, pathToFileURL } from "node:url"

const candidates = [
  process.env.BENEFITSI_WEB_ROOT,
  fileURLToPath(new URL("../../../benefitsi-web/", import.meta.url)),
  fileURLToPath(new URL("../../../New project/benefitsi-web/", import.meta.url)),
].filter(Boolean)

export const webRoot = await (async () => {
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.R_OK)
      return pathToFileURL(`${candidate.replace(/\/?$/, "")}/`)
    } catch {
      // Keep looking so the tests work from either supported workspace layout.
    }
  }

  throw new Error(
    "Benefitsi web repository not found. Set BENEFITSI_WEB_ROOT to its absolute path.",
  )
})()
