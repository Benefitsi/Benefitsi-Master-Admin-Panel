import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { loadFieldControls, type CityEditorEntityType, type CityFieldControl } from "@/lib/city-pages/field-controls"

export const citySurfaceTypes = ["homepage", "hubs", "collections", "navigation"] as const
export type CitySurfaceType = (typeof citySurfaceTypes)[number]
export type CityPageConfigScope = "HOMEPAGE" | "HUB" | "COLLECTION" | "NAVIGATION"
export type CityPageConfigStatus = "ACTIVE" | "DRAFT" | "ARCHIVED"

export const cityHubSurfaceKeys = [
  "current",
  "discovery",
  "events-community",
  "routes-guides",
  "city-service",
  "benefits",
] as const
export type CityHubSurfaceKey = (typeof cityHubSurfaceKeys)[number]

export const cityCollectionSurfaceKeys = [
  "sehenswuerdigkeiten",
  "freizeit",
  "natur-ausfluege",
  "sport",
  "familie",
  "schlechtwetter",
  "wellness-beauty",
  "shopping",
  "services",
] as const
export type CityCollectionSurfaceKey = (typeof cityCollectionSurfaceKeys)[number]

export type CityFeaturedRef = {
  id: string
  entityType: "PLACE" | "EVENT" | "ROUTE" | "GUIDE" | "BUSINESS" | "EDITORIAL"
  slug?: string
}

export type CitySafeTarget = {
  kind: "HUB" | "COLLECTION" | "PLACE" | "ROUTE" | "EVENT" | "GUIDE" | "BUSINESS" | "UTILITY" | "ANCHOR" | "EXTERNAL"
  href: string
  key: string
}

export type CityNavigationOverride = {
  itemKey: string
  label: string
  visible: boolean
  order: number
  target: CitySafeTarget
}

export type CityPageConfigRow = {
  id: string
  city_id: string
  scope_type: CityPageConfigScope
  scope_key: string
  status: CityPageConfigStatus
  title: string | null
  subtitle: string | null
  description: string | null
  eyebrow: string | null
  seo_title: string | null
  seo_description: string | null
  hero_image_alt: string | null
  primary_cta_label: string | null
  primary_cta_target: CitySafeTarget | null
  featured_refs: CityFeaturedRef[]
  related_collection_slugs: string[]
  guide_relation_ids: string[]
  filter_visibility: Record<string, boolean>
  section_visibility: Record<string, boolean>
  navigation_items: CityNavigationOverride[]
  index_policy: "index" | "noindex"
  updated_at: string
}

export type CitySurfaceEntityOption = {
  id: string
  entityType: CityFeaturedRef["entityType"]
  label: string
  location: string | null
  imageUrl: string | null
  slug: string | null
  status: string | null
}

export type CitySafeTargetOption = CitySafeTarget & {
  label: string
  group: string
}

export type CityNavigationEditorItem = {
  itemKey: string
  label: string
  visible: boolean
  order: number
  targetKey: string
  group: string
}

export type CitySurfaceEditorData = {
  city: { id: string; slug: string; name: string; region: string | null }
  surface: CitySurfaceType
  scopeType: CityPageConfigScope
  scopeKey: string
  config: CityPageConfigRow | null
  fieldControls: Record<string, CityFieldControl>
  entityOptions: CitySurfaceEntityOption[]
  targetOptions: CitySafeTargetOption[]
  navigationItems: CityNavigationEditorItem[]
  mediaAssignments: Array<{ id: string; role: string; publicUrl: string; altText: string | null; updatedAt: string }>
  audits: Array<{ id: string; fieldPath: string; action: string; beforeValue: unknown; afterValue: unknown; actorProfile: string | null; createdAt: string }>
}

export const surfaceLabels: Record<CitySurfaceType, string> = {
  homepage: "Homepage",
  hubs: "Hubs",
  collections: "Collections",
  navigation: "Navigation",
}

export const hubSurfaceLabels: Record<CityHubSurfaceKey, string> = {
  current: "Aktuell",
  discovery: "Entdecken & Erleben",
  "events-community": "Events & Community",
  "routes-guides": "Touren & Guides",
  "city-service": "Stadt & Service",
  benefits: "Vorteile",
}

export const collectionSurfaceLabels: Record<CityCollectionSurfaceKey, string> = {
  sehenswuerdigkeiten: "Sehenswürdigkeiten",
  freizeit: "Freizeit",
  "natur-ausfluege": "Natur & Ausflüge",
  sport: "Sport",
  familie: "Familie",
  schlechtwetter: "Bei Regen",
  "wellness-beauty": "Wellness & Beauty",
  shopping: "Shopping",
  services: "Services",
}

export function isCitySurfaceType(value: string): value is CitySurfaceType {
  return citySurfaceTypes.includes(value as CitySurfaceType)
}

export function surfaceScope(surface: CitySurfaceType, requestedKey?: string): { scopeType: CityPageConfigScope; scopeKey: string } {
  if (surface === "homepage") return { scopeType: "HOMEPAGE", scopeKey: "homepage" }
  if (surface === "navigation") return { scopeType: "NAVIGATION", scopeKey: "main" }
  if (surface === "hubs") {
    const scopeKey = cityHubSurfaceKeys.includes(requestedKey as CityHubSurfaceKey) ? requestedKey! : "current"
    return { scopeType: "HUB", scopeKey }
  }
  const scopeKey = cityCollectionSurfaceKeys.includes(requestedKey as CityCollectionSurfaceKey) ? requestedKey! : "sehenswuerdigkeiten"
  return { scopeType: "COLLECTION", scopeKey }
}

function text(value: unknown, max = 5000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : []
}

function boolMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key, item]) => /^[a-z0-9_-]{1,80}$/i.test(key) && typeof item === "boolean")) as Record<string, boolean>
}

function featuredRefs(value: unknown): CityFeaturedRef[] {
  return rows(value).flatMap((row) => {
    const id = text(row.id, 80)
    const entityType = text(row.entityType ?? row.entity_type, 20) as CityFeaturedRef["entityType"] | null
    if (!id || !entityType || !["PLACE", "EVENT", "ROUTE", "GUIDE", "BUSINESS", "EDITORIAL"].includes(entityType)) return []
    return [{ id, entityType, slug: text(row.slug, 180) ?? undefined }]
  }).slice(0, 100)
}

function target(value: unknown): CitySafeTarget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const kind = text(row.kind, 20) as CitySafeTarget["kind"] | null
  const href = text(row.href, 1000)
  const key = text(row.key, 180)
  if (!kind || !href || !key || !["HUB", "COLLECTION", "PLACE", "ROUTE", "EVENT", "GUIDE", "BUSINESS", "UTILITY", "ANCHOR", "EXTERNAL"].includes(kind)) return null
  return { kind, href, key }
}

function navigationOverrides(value: unknown): CityNavigationOverride[] {
  return rows(value).flatMap((row) => {
    const itemKey = text(row.itemKey ?? row.item_key, 180)
    const label = text(row.label, 120)
    const itemTarget = target(row.target)
    if (!itemKey || !label || !itemTarget) return []
    return [{ itemKey, label, visible: row.visible !== false, order: typeof row.order === "number" ? row.order : 0, target: itemTarget }]
  }).slice(0, 200)
}

function normalizeConfig(row: Record<string, unknown>): CityPageConfigRow {
  return {
    id: String(row.id),
    city_id: String(row.city_id),
    scope_type: String(row.scope_type) as CityPageConfigScope,
    scope_key: String(row.scope_key),
    status: (row.status === "DRAFT" || row.status === "ARCHIVED" ? row.status : "ACTIVE") as CityPageConfigStatus,
    title: text(row.title, 240),
    subtitle: text(row.subtitle, 500),
    description: text(row.description, 5000),
    eyebrow: text(row.eyebrow, 180),
    seo_title: text(row.seo_title, 180),
    seo_description: text(row.seo_description, 500),
    hero_image_alt: text(row.hero_image_alt, 300),
    primary_cta_label: text(row.primary_cta_label, 120),
    primary_cta_target: target(row.primary_cta_target),
    featured_refs: featuredRefs(row.featured_refs),
    related_collection_slugs: Array.isArray(row.related_collection_slugs) ? row.related_collection_slugs.filter((item): item is string => typeof item === "string") : [],
    guide_relation_ids: Array.isArray(row.guide_relation_ids) ? row.guide_relation_ids.filter((item): item is string => typeof item === "string") : [],
    filter_visibility: boolMap(row.filter_visibility),
    section_visibility: boolMap(row.section_visibility),
    navigation_items: navigationOverrides(row.navigation_items),
    index_policy: row.index_policy === "noindex" ? "noindex" : "index",
    updated_at: String(row.updated_at ?? ""),
  }
}

function publicPath(citySlug: string, entityType: string, slug: string) {
  const base = `/stadt/${encodeURIComponent(citySlug)}`
  if (entityType === "PLACE") return `${base}/entdecken/ort/${encodeURIComponent(slug)}`
  if (entityType === "EVENT") return `${base}/entdecken/event/${encodeURIComponent(slug)}`
  if (entityType === "ROUTE") return `${base}/entdecken/route/${encodeURIComponent(slug)}`
  if (entityType === "GUIDE") return `${base}/${encodeURIComponent(slug)}`
  if (entityType === "BUSINESS") return `${base}/essen-trinken/${encodeURIComponent(slug)}`
  return base
}

function isPublicEntityStatus(status: string | null) {
  return !status || ["active", "published", "verified", "prelaunch"].includes(status.toLowerCase())
}

function targetOptions(city: { slug: string }, entities: CitySurfaceEntityOption[]): CitySafeTargetOption[] {
  const base = `/stadt/${encodeURIComponent(city.slug)}`
  const options: CitySafeTargetOption[] = [
    ...cityHubSurfaceKeys.map((key) => ({ key: `HUB:${key}`, kind: "HUB" as const, href: `${base}/${key === "current" ? "aktuell" : key === "discovery" ? "entdecken" : key === "events-community" ? "veranstaltungen" : key === "routes-guides" ? "routen" : key === "city-service" ? "stadtwissen" : "vorteile"}`, label: hubSurfaceLabels[key], group: "Hubs" })),
    ...cityCollectionSurfaceKeys.map((key) => ({ key: `COLLECTION:${key}`, kind: "COLLECTION" as const, href: key === "sehenswuerdigkeiten" ? `${base}/sehenswuerdigkeiten` : `${base}/entdecken/${key}`, label: collectionSurfaceLabels[key], group: "Collections" })),
    { key: "UTILITY:home", kind: "UTILITY", href: base, label: "Stadt-Homepage", group: "System" },
    { key: "UTILITY:map", kind: "UTILITY", href: `${base}/karte`, label: "Karte", group: "System" },
    { key: "UTILITY:community", kind: "UTILITY", href: `${base}/community/treffen`, label: "Community-Treffen", group: "System" },
    { key: "UTILITY:newsletter", kind: "ANCHOR", href: `${base}#newsletter`, label: "Newsletter", group: "System" },
  ]
  for (const entity of entities) {
    if (!isPublicEntityStatus(entity.status)) continue
    const slug = entity.slug || entity.id
    // Editorial posts can be curated on the overview, but they do not have a
    // public City target in this picker yet. Keeping them out here prevents an
    // unsafe/ambiguous navigation target from being persisted.
    if (entity.entityType === "EDITORIAL") continue
    const kind = entity.entityType
    options.push({ key: `${kind}:${entity.id}`, kind, href: publicPath(city.slug, kind, slug), label: entity.label, group: kind })
  }
  return options
}

function navigationDefaults(city: { slug: string }, options: CitySafeTargetOption[]): CityNavigationEditorItem[] {
  const byKey = new Map(options.map((option) => [option.key, option]))
  return cityHubSurfaceKeys.map((key, index) => {
    const targetKey = `HUB:${key}`
    const target = byKey.get(targetKey)!
    return { itemKey: `menu:${key === "discovery" ? "entdecken" : key === "events-community" ? "events" : key === "routes-guides" ? "routen" : key === "city-service" ? "service" : key === "benefits" ? "vorteile" : "aktuell"}`, label: hubSurfaceLabels[key], visible: true, order: index, targetKey: target.key, group: "Hauptnavigation" }
  })
}

function mediaEntityType(scopeType: CityPageConfigScope) {
  return scopeType === "HOMEPAGE" ? "CITY_HOMEPAGE" : scopeType
}

function fieldControlEntityType(scopeType: CityPageConfigScope): CityEditorEntityType {
  return scopeType === "HOMEPAGE" ? "CITY_HOMEPAGE" : scopeType === "NAVIGATION" ? "HUB" : scopeType
}

export async function loadCitySurfaceEditor(citySlug: string, surface: CitySurfaceType, requestedKey?: string): Promise<CitySurfaceEditorData | null> {
  const admin = createAdminClient()
  const cityResult = await admin.from("cities").select("id,slug,name,region").eq("slug", citySlug).maybeSingle()
  if (cityResult.error || !cityResult.data) return null
  const city = { id: String(cityResult.data.id), slug: String(cityResult.data.slug), name: String(cityResult.data.name), region: text(cityResult.data.region) }
  const { scopeType, scopeKey } = surfaceScope(surface, requestedKey)
  const [configResult, entityResults] = await Promise.all([
    admin.from("city_page_configs").select("*").eq("city_id", city.id).eq("scope_type", scopeType).eq("scope_key", scopeKey).maybeSingle(),
    Promise.all([
      admin.from("city_places").select("id,name,canonical_slug,address,image_url,status").eq("city_id", city.id).order("name").limit(1000),
      admin.from("city_events").select("id,title,canonical_slug,location_name,image_url,status").eq("city_id", city.id).order("title").limit(1000),
      admin.from("city_routes").select("id,title,canonical_slug,start_location,image_url,status").eq("city_id", city.id).order("title").limit(1000),
      admin.from("city_guides").select("id,title,slug,hero_image_url,status").eq("city_id", city.id).order("title").limit(1000),
      admin.from("partners").select("id,name,slug,city,status").eq("city_id", city.id).order("name").limit(1000),
    ]),
  ])
  const entityOptions: CitySurfaceEntityOption[] = []
  const definitions = [
    { type: "PLACE" as const, result: entityResults[0], label: "name", slug: "canonical_slug", location: "address", image: "image_url" },
    { type: "EVENT" as const, result: entityResults[1], label: "title", slug: "canonical_slug", location: "location_name", image: "image_url" },
    { type: "ROUTE" as const, result: entityResults[2], label: "title", slug: "canonical_slug", location: "start_location", image: "image_url" },
    { type: "GUIDE" as const, result: entityResults[3], label: "title", slug: "slug", location: "", image: "hero_image_url" },
    { type: "BUSINESS" as const, result: entityResults[4], label: "name", slug: "slug", location: "city", image: "" },
  ]
  for (const definition of definitions) {
    for (const row of rows(definition.result.data)) {
      const id = text(row.id, 80)
      const label = text(row[definition.label], 240)
      if (!id || !label) continue
      entityOptions.push({ id, entityType: definition.type, label, location: definition.location ? text(row[definition.location], 240) : null, imageUrl: definition.image ? text(row[definition.image], 1000) : null, slug: definition.slug ? text(row[definition.slug], 180) : null, status: text(row.status, 40) })
    }
  }
  const options = targetOptions(city, entityOptions)
  const config = configResult.data ? normalizeConfig(configResult.data as Record<string, unknown>) : null
  const selectedOptions = options.filter((option) => config?.navigation_items.some((item) => item.target.key === option.key))
  const navigationItems = config?.navigation_items.length
    ? config.navigation_items.map((item) => ({ itemKey: item.itemKey, label: item.label, visible: item.visible, order: item.order, targetKey: item.target.key, group: "Hauptnavigation" }))
    : navigationDefaults(city, selectedOptions.length ? selectedOptions : options)
  const entityId = config?.id ?? (scopeType === "HOMEPAGE" ? city.id : "")
  const fieldControls = entityId ? await loadFieldControls(admin, city.id, fieldControlEntityType(scopeType), entityId) : {}
  let mediaAssignments: CitySurfaceEditorData["mediaAssignments"] = []
  if (config?.id) {
    const assignmentsResult = await admin.from("city_media_assignments").select("id,media_asset_id,role,updated_at").eq("city_id", city.id).eq("entity_type", mediaEntityType(scopeType)).eq("entity_id", config.id).order("updated_at", { ascending: false })
    const assetIds = rows(assignmentsResult.data).map((row) => text(row.media_asset_id, 80)).filter((id): id is string => Boolean(id))
    const assetsResult = assetIds.length ? await admin.from("city_media_assets").select("id,public_url,alt_text").in("id", assetIds) : { data: [] }
    const assets = new Map(rows(assetsResult.data).map((row) => [String(row.id), row]))
    mediaAssignments = rows(assignmentsResult.data).flatMap((row) => {
      const asset = assets.get(String(row.media_asset_id))
      if (!asset) return []
      return [{ id: String(row.id), role: String(row.role), publicUrl: String(asset.public_url ?? ""), altText: text(asset.alt_text, 300), updatedAt: String(row.updated_at ?? "") }]
    })
  }
  const auditResult = config?.id ? await admin.from("city_editor_audit").select("id,field_path,action,before_value,after_value,actor_profile,created_at").eq("city_id", city.id).eq("entity_id", config.id).order("created_at", { ascending: false }).limit(30) : { data: [] }
  const audits = rows(auditResult.data).map((row) => ({ id: String(row.id), fieldPath: String(row.field_path), action: String(row.action), beforeValue: row.before_value, afterValue: row.after_value, actorProfile: text(row.actor_profile, 180), createdAt: String(row.created_at ?? "") }))
  return { city, surface, scopeType, scopeKey, config, fieldControls, entityOptions, targetOptions: options, navigationItems, mediaAssignments, audits }
}

export function configFieldPaths(surface: CitySurfaceType) {
  const common = ["title", "subtitle", "description", "eyebrow", "seo_title", "seo_description", "hero_image_alt", "primary_cta_label", "primary_cta_target", "featured_refs", "related_collection_slugs", "guide_relation_ids", "filter_visibility", "section_visibility", "index_policy"]
  return surface === "navigation" ? ["navigation_items", "index_policy"] : common
}

export function sectionOptions(surface: CitySurfaceType) {
  if (surface === "homepage") return ["hero", "current", "weekend", "discovery", "community", "routes", "benefits", "stamps", "newsletter"]
  if (surface === "collections") return ["hero", "featured", "filters", "all-items", "recommendations", "cross-links", "stamps", "guides", "newsletter"]
  if (surface === "hubs") return ["hero", "quick-links", "current-feed", "weekend", "news", "market", "collections", "entity-grid", "event-feed", "community", "routes", "guides", "partners", "benefits", "stamps", "challenges", "service-links", "map", "editorial", "cta", "newsletter"]
  return []
}
