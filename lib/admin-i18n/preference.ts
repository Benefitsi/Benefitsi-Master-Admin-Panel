export type AdminLanguage = "en" | "de"

type Preference = { language: AdminLanguage; listeners: Set<() => void> }
// Browser-scoped memory preserves navigation preferences even when storage is blocked.
// A WeakMap also prevents server requests or separate browser documents sharing state.
const preferences = new WeakMap<Window, Map<string, Preference>>()

function getPreference(key: string, initialLanguage: AdminLanguage): Preference {
  let byKey = preferences.get(window)
  if (!byKey) {
    byKey = new Map()
    preferences.set(window, byKey)
  }
  let preference = byKey.get(key)
  if (!preference) {
    let language = initialLanguage
    try {
      const saved = window.localStorage.getItem(key)
      if (saved === "de" || saved === "en") language = saved
    } catch {
      // The language switch also works in storage-restricted browsers.
    }
    preference = { language, listeners: new Set() }
    byKey.set(key, preference)
  }
  return preference
}

export function getAdminLanguage(key: string, initialLanguage: AdminLanguage) {
  return getPreference(key, initialLanguage).language
}

export function subscribeAdminLanguage(key: string, initialLanguage: AdminLanguage, listener: () => void) {
  const preference = getPreference(key, initialLanguage)
  preference.listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return
    if (event.newValue !== null && event.newValue !== "de" && event.newValue !== "en") return
    preference.language = event.newValue ?? initialLanguage
    listener()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    preference.listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

export function setAdminLanguage(key: string, initialLanguage: AdminLanguage, language: AdminLanguage) {
  const preference = getPreference(key, initialLanguage)
  preference.language = language
  try { window.localStorage.setItem(key, language) } catch { /* Keep the in-memory preference. */ }
  preference.listeners.forEach(listener => listener())
}
