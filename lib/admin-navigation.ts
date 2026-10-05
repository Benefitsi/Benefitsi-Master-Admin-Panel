export type AdminNavigationIcon =
  | "overview" | "partner" | "cities" | "review" | "editorial"
  | "media" | "knowledge" | "bookings" | "commerce" | "agents"
  | "automation" | "analytics" | "seo"

export type AdminNavigationLink = {
  label: string
  href: string
  icon: AdminNavigationIcon
}

export type AdminNavigationGroup = {
  id: string
  label: string
  icon: AdminNavigationIcon
  items: readonly AdminNavigationLink[]
}

export const adminNavigation: readonly (AdminNavigationLink | AdminNavigationGroup)[] = [
  { label: "Übersicht", href: "/", icon: "overview" },
  { label: "Partner", href: "/partners", icon: "partner" },
  { label: "Unternehmen", href: "/companies", icon: "partner" },
  { id: "cities", label: "Städte", icon: "cities", items: [
    { label: "Stadtportale", href: "/city-pages", icon: "cities" },
    { label: "Prüfung & Freigaben", href: "/city-operations", icon: "review" },
  ] },
  { id: "content", label: "Inhalte", icon: "editorial", items: [
    { label: "Magazin", href: "/editorial", icon: "editorial" },
    { label: "Medien", href: "/media", icon: "media" },
    { label: "Wissen", href: "/wissen", icon: "knowledge" },
  ] },
  { id: "orders", label: "Buchungen & Bestellungen", icon: "bookings", items: [
    { label: "Buchungen", href: "/bookings", icon: "bookings" },
    { label: "Essensbestellungen", href: "/commerce", icon: "commerce" },
  ] },
  { id: "agents", label: "Agenten", icon: "agents", items: [
    { label: "Agentenübersicht", href: "/agents", icon: "agents" },
    { label: "Aufträge & Abläufe", href: "/automation", icon: "automation" },
  ] },
  { id: "analytics", label: "Auswertung", icon: "analytics", items: [
    { label: "Geschäftszahlen", href: "/analytics", icon: "analytics" },
    { label: "SEO & Sichtbarkeit", href: "/seo", icon: "seo" },
  ] },
]

export function isAdminNavigationActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`))
}
