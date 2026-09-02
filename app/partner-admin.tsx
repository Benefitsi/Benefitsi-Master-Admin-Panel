"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type RefObject,
  type ReactNode,
} from "react"
import { useFormStatus } from "react-dom"
import type {
  City,
  Deal,
  MenuCategory,
  MenuItem,
  MenuItemAddon,
  OwnerOption,
  PartnerHoliday,
  PartnerMenu,
  PartnerOpeningHour,
  PartnerRewardMilestone,
  PartnerSocial,
  PartnerStaff,
  PartnerWithDeals,
  StampCardProgress,
  Visit,
} from "@/lib/admin-data"
import {
  DEFAULT_MENU_STATUS,
  adminTextLimits,
  MAX_PARTNER_SOCIALS,
  partnerMediaSpecs,
  partnerSocialPlatformOptions,
  type PartnerMediaSpec,
} from "@/lib/partner-config"
import {
  DEFAULT_AUDIENCE,
  DEFAULT_DEAL_DROP_WEEKDAYS,
  DEFAULT_REWARD_TRACK_TARGET,
  DEFAULT_SELECTION_EXPIRES_MINUTES,
  DEFAULT_TIMEZONE,
  MAX_STAMP_CARD_STAMPS,
  activationRequiredForCategory,
  audienceOptions,
  benefitCategoryOptions,
  dealDropDiscountTypeOptions,
  dealDropWeekdayOptions,
  dealTypeOptions,
  discountTypeOptions,
  inferBenefitCategory,
  milestoneAudienceOptions,
  normalizeBenefitCategory,
  partnerStaffRoleOptions,
  rewardTypeOptions,
  weekdayOptions,
} from "@/lib/reward-config"
import {
  createPartnerCoverUpload,
  deleteDeal,
  deleteMenu,
  deleteMenuCategory,
  deleteMenuItem,
  duplicateMenuCategory,
  importMenuFile,
  deletePartnerStaff,
  deletePartner,
  deleteRewardMilestone,
  generateDealCopy,
  generatePartnerDescription,
  reorderMenuCategories,
  reorderMenuItems,
  saveDeal,
  saveMenu,
  saveMenuCategory,
  saveMenuCategoryImage,
  saveMenuItem,
  saveMenuItemImage,
  savePartnerStaff,
  savePartner,
  saveRewardMilestone,
  saveWeeklyOpeningHours,
  rotatePartnerPin,
  type PartnerActionState,
} from "./partner-actions"
import type { DealCopyField } from "@/lib/deal-copy"
import type { DealFormDraft } from "@/lib/deal-form"
import {
  benefitTaxonomyLabel,
  formatBenefitTitle,
} from "@/lib/benefit-taxonomy"
import { researchPartner } from "./partner-enrichment-actions"
import type {
  GeminiProviderWarning,
  PartnerEnrichmentOpeningHour,
  PartnerEnrichmentResult,
  PartnerEnrichmentSource,
} from "@/lib/partner-enrichment"
import { MicrositePanel } from "./microsite-panel"
import { useAdminLanguage } from "./admin-language"
import { LoadingSpinner } from "@/components/loading-ui"
import { createClient as createBrowserClient } from "@/lib/supabase/client"

const initialState: PartnerActionState = {
  ok: false,
  message: "",
}

const toastEventName = "benefitsi:action-toast"

type ActionToast = {
  id: number
  message: string
  ok: boolean
}

function useToastNotification(state: PartnerActionState) {
  useEffect(() => {
    if (!state.message) return

    dispatchActionToast(state)
  }, [state])
}

function dispatchActionToast(state: PartnerActionState) {
  if (!state.message) return

  window.dispatchEvent(
    new CustomEvent(toastEventName, {
      detail: { message: state.message, ok: state.ok },
    }),
  )
}

function ToastViewport() {
  const [toast, setToast] = useState<ActionToast | null>(null)

  useEffect(() => {
    let timeoutId: number | undefined
    const showToast = (event: Event) => {
      const detail = (event as CustomEvent<Omit<ActionToast, "id">>).detail
      window.clearTimeout(timeoutId)
      setToast({ ...detail, id: Date.now() })
      timeoutId = window.setTimeout(() => setToast(null), 3600)
    }

    window.addEventListener(toastEventName, showToast)
    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener(toastEventName, showToast)
    }
  }, [])

  if (!toast) return null

  return (
    <div
      key={toast.id}
      role={toast.ok ? "status" : "alert"}
      className={`fixed right-4 top-4 z-[100] flex max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold shadow-2xl animate-in fade-in slide-in-from-top-2 ${
        toast.ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-rose-200 bg-rose-50 text-rose-800"
      }`}
    >
      <span aria-hidden="true" className="text-base leading-5">
        {toast.ok ? "✓" : "!"}
      </span>
      <span className="leading-5">{toast.message}</span>
      <button
        type="button"
        onClick={() => setToast(null)}
        aria-label="Dismiss notification"
        className="ml-2 text-lg leading-5 opacity-60 transition hover:opacity-100"
      >
        ×
      </button>
    </div>
  )
}

function useActionSuccess(
  state: PartnerActionState,
  onSuccess?: (state: PartnerActionState) => void,
) {
  const onSuccessRef = useRef(onSuccess)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    onSuccessRef.current = onSuccess
  }, [onSuccess])

  useEffect(() => {
    if (state.ok) {
      onSuccessRef.current?.(state)
      const details = formRef.current?.closest("details")
      if (details?.open) details.open = false
    }
  }, [state])

  return formRef
}

const partnerTypeOptions = [
  { value: "Food & Drink", label: "Food & Drink" },
  { value: "Services", label: "Services" },
  { value: "Wellness", label: "Wellness" },
  { value: "Activities", label: "Activities" },
]

const categoryOptions = [
  "Döner",
  "Pizza",
  "Shawarma",
  "Burger",
  "Chinese",
  "Imbiss",
  "Metzgerei",
  "Suppe",
  "Cafe",
  "Grill",
  "Falafel",
  "Bowl",
  "Thai",
  "Sushi",
  "Restaurant",
  "Asia",
  "Eis",
  "Inder",
  "Grieche",
].map((category) => ({ value: category, label: category }))

const emptyCityOptions = [
  {
    value: "",
    label: "No cities available",
  },
]

const partnerMediaAccept = "image/png,image/jpeg,image/webp,image/svg+xml"
const uploadPlaceholderSrc = "/upload-image.jpg"
const maxCoverPhotos = 5
const stampProgressDisplayLimit = 20
const redemptionHistoryDisplayLimit = 20
const comebackCandidateDisplayLimit = 20

const openingWeekdayOptions = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "7", label: "Sunday" },
] as const

const DURATION_BONUS_DEAL = "duration_bonus"
const COMEBACK_INACTIVE_DEAL = "comeback_inactive"
const COMEBACK_INACTIVE_MODE = "comeback_inactive"
const CREATE_NEW_OWNER_VALUE = "__create_new_owner__"

const dealUiTypeOptions = dealTypeOptions.flatMap((option) =>
  option.value === "comeback"
    ? [
        { value: DURATION_BONUS_DEAL, label: "Zeitbonus" },
        { value: COMEBACK_INACTIVE_DEAL, label: "Comeback-Deal" },
      ]
    : [option],
)

const durationUnitOptions = [
  { value: "hours", label: "Stunden" },
  { value: "days", label: "Tage" },
  { value: "weeks", label: "Wochen" },
] as const

const inactivityUnitOptions = [
  { value: "days", label: "Tage" },
  { value: "weeks", label: "Wochen" },
  { value: "months", label: "Monate" },
] as const

const menuStatusOptions = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
] as const

const menuCurrencyOptions = [{ value: "EUR", label: "EUR (€)" }] as const

type PartnerWorkspaceProps = {
  partners: PartnerWithDeals[]
  cities: City[]
  owners: OwnerOption[]
  initialMode?: "view" | "create"
  initialPartnerId?: string
  initialSettingsTab?: string
  initialView?: "settings" | "microsite"
  portalMode?: boolean
}

type InitialDealDraft = {
  id: string
  active: boolean
  audience?: string
  benefitCategory?: string
  dealType?: string
  discountType?: string
  displaySubtitle?: string
  displaySubtitleAuto?: boolean
  displayTitle?: string
  rewardSummary?: string
  title: string
}

type InitialMenuCategoryDraft = {
  id: string
  imagePreviewUrl: string
  name: string
  sortOrder: string
}

type InitialMenuItemDraft = {
  id: string
  categoryDraftId: string
  description: string
  imagePreviewUrl: string
  isPopular: boolean
  name: string
  price: string
  currency: string
  tags: string
  allergens: string
  sortOrder: string
}

type ResearchedPartnerMedia = {
  logoUrl: string
  featureUrl: string
  discoverUrl: string
  coverUrls: string[]
}

type SocialHandleDraft = {
  id: string
  platform: string
  handle: string
}

type HolidayDraft = {
  id: string
  date: string
  label: string
  kind: "closed" | "hours"
  opensAt: string
  closesAt: string
  repeatsYearly: boolean
}

type HolidayEditorState =
  | { mode: "create" }
  | { mode: "edit"; holiday: HolidayDraft }

type InitialMilestoneDraft = {
  id: string
  active: boolean
  audience: string
  customerDescription: string
  discountValue: string
  estimatedSavings: string
  requiredStamps: string
  rewardItem: string
  rewardType: string
  staffInstructions: string
  terms: string
  title: string
}

type SectionStatusTone = "info" | "recommended" | "required" | "required-subtle"

type SectionStatus = {
  label: string
  tone?: SectionStatusTone
}

type SectionStatusValue = SectionStatus | SectionStatus[]

type PartnerSettingsTab =
  | "details"
  | "deals"
  | "menu"
  | "access"
  | "activity"
  | "danger"

function isPartnerSettingsTab(value: string | undefined): value is PartnerSettingsTab {
  return ["details", "deals", "menu", "access", "activity", "danger"].includes(
    value ?? "",
  )
}

function rememberWorkspaceLocation(
  updates: Record<string, string | null | undefined>,
) {
  const url = new URL(window.location.href)

  for (const [name, value] of Object.entries(updates)) {
    if (value) url.searchParams.set(name, value)
    else url.searchParams.delete(name)
  }

  window.history.replaceState(window.history.state, "", url)
}

type CreatePartnerTab = "profile" | "operations" | "offers" | "menu" | "review"

type CreatePartnerReviewSnapshot = {
  name: string
  type: string
  city: string
  owner: string
  email: string
  phone: string
  website: string
  address: string
  categories: string[]
  active: boolean
  featured: boolean
  requiredComplete: number
  requiredTotal: number
  openDays: number
  coverCount: number
  milestoneCount: number
  dealCount: number
  menuStatus: "Set" | "Incomplete" | "Not set"
  logoSet: boolean
  featureCardSet: boolean
  discoveryImageSet: boolean
  descriptionSet: boolean
  coordinatesSet: boolean
  socialCount: number
}

type MenuItemEditorState =
  | { mode: "create" }
  | { mode: "edit" | "duplicate"; item: MenuItem }

type MenuCategoryEditorState =
  | { mode: "create" }
  | { mode: "edit"; category: MenuCategory }

type DealEditorState =
  | { mode: "create" }
  | { mode: "edit"; deal: Deal }

type MilestoneEditorState =
  | { mode: "create" }
  | { mode: "edit"; milestone: PartnerRewardMilestone }

const partnerSettingsTabCopy: Record<
  PartnerSettingsTab,
  { title: string; description: string }
> = {
  details: { title: "Partner profile", description: "Business information, contact details, location, branding, and media." },
  deals: { title: "Stamps and Deals", description: "Manage stamp-card rewards alongside customer deals, eligibility rules, availability, and redemption settings." },
  menu: { title: "Menu management", description: "Menu details, categories, items, pricing, images, and display order." },
  access: { title: "Staff access", description: "Manage the staff members who can administer or scan for this partner." },
  activity: { title: "Customer activity", description: "Review stamp-card progress, visits, applied benefits, and redemptions." },
  danger: { title: "Delete partner", description: "Permanently remove this partner and its attached records." },
}

const createPartnerTabCopy: Record<
  CreatePartnerTab,
  { title: string; description: string }
> = {
  profile: { title: "Business profile", description: "Enter the partner's identity, ownership, contact details, and location." },
  operations: { title: "Operations and media", description: "Configure opening hours, holiday closures, branding, and cover images." },
  offers: { title: "Rewards and benefits", description: "Set up stamp-card milestones and optional customer benefits." },
  menu: { title: "Starter menu", description: "Create the initial menu, categories, items, prices, and images." },
  review: { title: "Review and create", description: "Review required sections, then create the partner and all staged content." },
}

export function PartnerWorkspace({
  partners,
  cities,
  owners,
  initialMode = "view",
  initialPartnerId = "",
  initialSettingsTab,
  initialView = "settings",
  portalMode = false,
}: PartnerWorkspaceProps) {
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<"view" | "create">(
    partners.length && (portalMode || initialMode === "view") ? "view" : "create",
  )
  const [selectedId, setSelectedId] = useState(
    initialPartnerId || partners[0]?.id || "",
  )
  const [workspaceLocation, setWorkspaceLocation] = useState<{
    tab: PartnerSettingsTab
    view: "settings" | "microsite"
  }>({
    tab: isPartnerSettingsTab(initialSettingsTab) ? initialSettingsTab : "details",
    view: initialView,
  })
  const startCreatePartner = useCallback(() => {
    if (portalMode) return
    setSelectedId("")
    setMode("create")
    rememberWorkspaceLocation({ mode: "create", partner: null, tab: null, view: null })
  }, [portalMode])

  const partnerCount = partners.length
  const activePartners = partners.filter(isPartnerActive).length
  const featuredPartners = partners.filter((partner) => partner.is_featured).length
  const dealCount = partners.reduce(
    (count, partner) => count + partner.deals.length,
    0,
  )
  const filteredPartners = useMemo(() => {
    const normalized = query.trim().toLowerCase()

    if (!normalized) {
      return partners
    }

    return partners.filter((partner) =>
      [
        partner.name,
        partner.short_name,
        partner.city_name,
        partner.type,
        partner.status,
        partner.email,
        partner.owner_email,
        ...(partner.category ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    )
  }, [partners, query])

  const selectedPartner =
    partners.find((partner) => partner.id === selectedId) ??
    filteredPartners[0] ??
    partners[0]

  return (
    <section id="partners" className="partner-management-brand space-y-3">
      <ToastViewport />
      <div className="grid overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
        <LiveMetric label="Partners" value={partnerCount} />
        <LiveMetric label="Active partners" value={activePartners} />
        <LiveMetric label="Featured partners" value={featuredPartners} />
        <LiveMetric label="Benefits" value={dealCount} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[310px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-normal">
                  Partners
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">Select a partner to edit.</p>
              </div>
              {!portalMode ? <button
                type="button"
                onClick={startCreatePartner}
                className="inline-flex min-h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-teal-700 px-3 text-sm font-semibold leading-none text-white transition hover:-translate-y-px hover:bg-teal-800 active:translate-y-0"
              >
                Add
              </button>
              : null}
            </div>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search partners"
              className="mt-3 h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          <div className="max-h-[calc(100vh-220px)] space-y-1.5 overflow-y-auto p-2">
            {filteredPartners.length ? (
              filteredPartners.map((partner) => (
                <PartnerListButton
                  key={partner.id ?? partner.name ?? "partner"}
                  partner={partner}
                  selected={
                    mode === "view" && selectedPartner?.id === partner.id
                  }
                  onSelect={() => {
                    setSelectedId(partner.id ?? "")
                    setMode("view")
                    setWorkspaceLocation({ tab: "details", view: "settings" })
                    rememberWorkspaceLocation({
                      mode: "view",
                      partner: partner.id,
                      tab: "details",
                      view: "settings",
                    })
                  }}
                />
              ))
            ) : (
              <div className="rounded-md border border-dashed border-zinc-300 p-5 text-center text-sm text-zinc-600">
                No partners match your search.
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0">
          {mode === "create" ? (
            <EditorShell
              title="Add partner"
              description="Create the partner profile, assign its owner, upload media, and add any deals in one save."
            >
              <PartnerForm cities={cities} owners={owners} mode="create" partners={partners} />
            </EditorShell>
          ) : selectedPartner ? (
              <PartnerDetail
                key={selectedPartner.id ?? selectedPartner.name ?? "partner"}
                cities={cities}
                owners={owners}
                onDeleted={startCreatePartner}
                partner={selectedPartner}
                initialSettingsTab={workspaceLocation.tab}
                initialView={workspaceLocation.view}
                onLocationChange={setWorkspaceLocation}
                portalMode={portalMode}
              />
          ) : (
            <EditorShell
              title="No partners yet"
              description="Add a partner to start managing deals."
            >
              <PartnerForm cities={cities} owners={owners} mode="create" partners={partners} />
            </EditorShell>
          )}
        </section>
      </div>
    </section>
  )
}

function LiveMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b border-zinc-200 px-3 py-2.5 last:border-b-0 sm:border-b-0">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tracking-normal text-zinc-950">
        {value}
      </p>
    </div>
  )
}

function PartnerListButton({
  partner,
  selected,
  onSelect,
}: {
  partner: PartnerWithDeals
  selected: boolean
  onSelect: () => void
}) {
  const hasDeals = partner.deals.length > 0

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-2.5 text-left transition ${
        selected
          ? "border-teal-300 bg-teal-50 shadow-sm ring-1 ring-teal-100"
          : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <LogoPreview url={partner.logo_url} name={partner.name} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold text-zinc-950">
              {partner.name || "Untitled partner"}
            </p>
            <StatusPill active={isPartnerActive(partner)} />
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {[partner.city_name ?? partner.city_id, partner.type]
              .filter(Boolean)
              .join(" - ") || "No location or type"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium text-zinc-600">
              {partner.deals.length} {partner.deals.length === 1 ? "deal" : "deals"}
            </p>
            {partner.is_featured ? <FeaturedBadge compact /> : null}
            {!hasDeals ? (
              <span className="whitespace-nowrap rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                Benefit recommended
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  )
}

function PartnerDetail({
  partner,
  cities,
  owners,
  onDeleted,
  initialSettingsTab,
  initialView = "settings",
  onLocationChange,
  portalMode = false,
}: {
  partner: PartnerWithDeals
  cities: City[]
  owners: OwnerOption[]
  onDeleted: () => void
  initialSettingsTab?: string
  initialView?: "settings" | "microsite"
  onLocationChange?: (location: {
    tab: PartnerSettingsTab
    view: "settings" | "microsite"
  }) => void
  portalMode?: boolean
}) {
  const partnerFormId = `partner-form-${partner.id ?? "partner"}`
  const partnerIdentity = partner.id ?? "partner"
  const builderIdentifier =
    partner.microsite?.slug ||
    partner.slug ||
    partner.subdomain ||
    partner.id ||
    "partner"
  const [viewState, setViewState] = useState<{
    partnerIdentity: string
    activeView: "settings" | "microsite"
  }>({
    partnerIdentity,
    activeView: initialView,
  })
  const activeView =
    viewState.partnerIdentity === partnerIdentity
      ? viewState.activeView
      : "settings"
  const [tabState, setTabState] = useState<{
    partnerIdentity: string
    tab: PartnerSettingsTab
  }>({
    partnerIdentity,
    tab: isPartnerSettingsTab(initialSettingsTab) ? initialSettingsTab : "details",
  })
  const requestedTab =
    tabState.partnerIdentity === partnerIdentity ? tabState.tab : "details"
  const settingsTab =
    requestedTab === "menu" && !partnerTypeSupportsMenu(partner.type)
      ? "details"
      : portalMode &&
          (requestedTab === "access" ||
            requestedTab === "activity" ||
            requestedTab === "danger")
        ? "details"
        : requestedTab
  const settingsTabs: Array<{
    id: PartnerSettingsTab
    label: string
    hasRequiredFields?: boolean
  }> = [
    { id: "details", label: "Partner Profile", hasRequiredFields: true },
    { id: "deals", label: "Stamps & Deals", hasRequiredFields: true },
    ...(partnerTypeSupportsMenu(partner.type)
      ? [{ id: "menu" as const, label: "Menu Management", hasRequiredFields: true }]
      : []),
    ...(portalMode
      ? []
      : [
          { id: "access" as const, label: "Staff Access", hasRequiredFields: true },
          { id: "activity" as const, label: "Customer Activity" },
          { id: "danger" as const, label: "Delete Partner" },
        ]),
  ]
  const activeTabCopy = partnerSettingsTabCopy[settingsTab]

  function setActiveView(nextView: "settings" | "microsite") {
    setViewState({
      partnerIdentity,
      activeView: nextView,
    })
    onLocationChange?.({ tab: settingsTab, view: nextView })
    rememberWorkspaceLocation({
      mode: "view",
      partner: partner.id,
      view: nextView,
    })
  }

  return (
    <div key={partner.id ?? "partner-detail"} className="space-y-5">
      <EditorShell
        compact={activeView === "settings"}
        title={partner.name || "Untitled partner"}
        description={
          activeView === "settings"
            ? "Edit partner details, social handles, media, milestones, deals, menu, hours, and Supabase routing fields."
            : "Edit the public microsite separately from the partner settings."
        }
        aside={
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm divide-x divide-zinc-200">
              <button
                type="button"
                onClick={() => setActiveView("settings")}
                className={`inline-flex min-h-9 shrink-0 items-center justify-center whitespace-nowrap px-3 py-2 text-sm font-semibold leading-none transition ${
                  activeView === "settings"
                    ? "bg-teal-700 text-white"
                    : "bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                }`}
              >
                Partner settings
              </button>
              <button
                type="button"
                onClick={() => setActiveView("microsite")}
                className={`inline-flex min-h-9 shrink-0 items-center justify-center whitespace-nowrap px-3 py-2 text-sm font-semibold leading-none transition ${
                  activeView === "microsite"
                    ? "bg-teal-700 text-white"
                    : "bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                }`}
              >
                Microsite builder
              </button>
            </div>
            <StatusPill active={isPartnerActive(partner)} />
            {partner.is_featured ? <FeaturedBadge /> : null}
          </div>
        }
      >
        {activeView === "settings" ? (
          <div>
            <nav
              aria-label="Partner settings"
              className="mb-4"
            >
              <div className="w-full overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
                <div className="flex min-w-max divide-x divide-zinc-200">
                  {settingsTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setTabState({ partnerIdentity, tab: tab.id })
                        onLocationChange?.({ tab: tab.id, view: "settings" })
                        rememberWorkspaceLocation({
                          mode: "view",
                          partner: partner.id,
                          tab: tab.id,
                          view: "settings",
                        })
                      }}
                      title={tab.label}
                      aria-current={settingsTab === tab.id ? "page" : undefined}
                      className={`min-h-12 min-w-[8.5rem] flex-1 px-3 py-2.5 text-center text-[11px] font-semibold leading-4 transition whitespace-normal break-words sm:text-xs ${
                        settingsTab === tab.id
                          ? tab.id === "danger"
                            ? "bg-rose-700 text-white"
                            : "bg-teal-700 text-white"
                          : tab.id === "danger"
                            ? "bg-white text-rose-700 hover:bg-rose-50"
                            : "bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950"
                      }`}
                    >
                      <span className="inline-flex max-w-full items-start justify-center gap-1 whitespace-normal break-words">
                        <span>{tab.label}</span>
                        {tab.hasRequiredFields ? (
                          <span
                            aria-hidden="true"
                            className="text-sm font-black leading-none text-rose-500"
                            title="Contains required fields"
                          >
                            *
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </nav>

            <section className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 sm:p-4">
            <header className="mb-4 border-b border-zinc-200 pb-3">
              <h3 className="text-lg font-semibold tracking-tight text-zinc-950">
                {activeTabCopy.title}
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-zinc-500">
                {activeTabCopy.description}
              </p>
            </header>
            {settingsTab === "details" ? (
              <div className="space-y-3">
                <PartnerForm
                  key={partner.id ?? "edit-partner"}
                  formId={partnerFormId}
                  cities={cities}
                  owners={owners}
                  partner={partner}
                  mode="edit"
                  portalMode={portalMode}
                />
                <div className="flex flex-wrap items-end justify-between gap-3 border-t border-zinc-200 pt-3">
                  <div className="max-w-xs flex-1">
                    <PartnerPinDisplay
                      mode="edit"
                      partnerId={partner.id}
                      pin={partner.pin}
                    />
                  </div>
                </div>
              </div>
            ) : null}
            {settingsTab === "deals" ? (
              <div className="space-y-3">
                <MilestonesPanel partner={partner} embedded />
                <DealsPanel partner={partner} embedded />
              </div>
            ) : null}
            {settingsTab === "menu" ? <MenuPanel partner={partner} embedded /> : null}
            {settingsTab === "access" ? (
              <PartnerStaffPanel partner={partner} users={owners} embedded />
            ) : null}
            {settingsTab === "activity" ? (
              <div className="space-y-4">
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-900">Stamp-card progress</h3>
                  <StampProgressPanel progress={partner.stamp_progress} embedded />
                </section>
                <section className="border-t border-zinc-200 pt-4">
                  <h3 className="mb-2 text-sm font-semibold text-zinc-900">Redemption history</h3>
                  <RedemptionHistoryPanel partner={partner} visits={partner.visits} embedded />
                </section>
              </div>
            ) : null}
            {settingsTab === "danger" ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                <DeletePartnerForm partner={partner} onDeleted={onDeleted} />
              </div>
            ) : null}
            </section>
          </div>
        ) : (
          <div className="space-y-5">
            <section className="rounded-md border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-semibold">Microsite builder</p>
                  <p className="mt-1 text-teal-800">
                    Edit the microsite here, or open the full-width builder for more space.
                  </p>
                </div>
                <Link
                  href={`${portalMode ? "/partner" : ""}/microsite-builder/${encodeURIComponent(builderIdentifier)}`}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800"
                >
                  Open full-width builder
                </Link>
              </div>
            </section>
            <MicrositePanel
              key={`${partner.id ?? partner.name ?? "microsite"}-${partner.microsite?.draftVersion?.id ?? partner.microsite?.publishedVersion?.id ?? "new"}`}
              partner={partner}
              previewBasePath={portalMode ? "/partner/microsite-preview" : undefined}
            />
          </div>
        )}
      </EditorShell>

    </div>
  )
}

function EditorShell({
  title,
  description,
  aside,
  children,
  collapsible = false,
  compact = true,
  defaultOpen = true,
  flat = false,
  status,
}: {
  title: string
  description: string
  aside?: ReactNode
  children: ReactNode
  collapsible?: boolean
  compact?: boolean
  defaultOpen?: boolean
  flat?: boolean
  status?: SectionStatusValue
}) {
  const [open, setOpen] = useState(defaultOpen)
  const contentOpen = collapsible ? open : true

  return (
    <div className={flat ? "" : compact ? "overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm" : "rounded-md border border-zinc-200 bg-white shadow-sm"}>
      <div
        className={`flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${
          flat ? "pb-4" : compact ? "p-3.5" : "p-5"
        } ${
          contentOpen && !flat ? "border-b border-zinc-200" : ""
        }`}
      >
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex min-w-0 flex-1 items-start gap-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-teal-100"
            aria-expanded={open}
          >
            <EditorShellTitle
              title={title}
              description={description}
              status={status}
            />
            <span className="ml-auto flex shrink-0 items-center pt-1">
              <span className="text-xs font-semibold text-zinc-500">
                {open ? "Collapse" : "Expand"}
              </span>
            </span>
          </button>
        ) : (
          <EditorShellTitle
            title={title}
            description={description}
            status={status}
          />
        )}
        {aside ? (
          <div className="flex min-w-0 shrink-0 flex-wrap gap-2">
            {aside}
          </div>
        ) : null}
      </div>
      <div className={contentOpen ? (flat ? "" : compact ? "p-3.5" : "p-5") : "hidden"}>{children}</div>
    </div>
  )
}

function EditorShellTitle({
  title,
  description,
  status,
}: {
  title: string
  description: string
  status?: SectionStatusValue
}) {
  return (
    <span className="min-w-0">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold tracking-normal text-zinc-950">
          {title}
        </span>
        {status ? <SectionStatusList status={status} /> : null}
      </span>
      <span className="mt-1 block max-w-2xl text-sm leading-6 text-zinc-600">
        {description}
      </span>
    </span>
  )
}

const enrichmentFieldLabels: Record<string, string> = {
  name: "Partner name",
  type: "Partner type",
  city: "Partner city",
  email: "Public email",
  description: "Description",
  phone: "Phone",
  website: "Website",
  coordinates: "Coordinates",
  address: "Address",
}

const researchProgressSteps = [
  "Checking the official website and relevant pages",
  "Looking for a matching map and location record",
  "Comparing names, addresses, and contact details",
  "Verifying sources, images, hours, and menu data",
  "Preparing reviewable suggestions",
] as const

function ResearchingIndicator() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setStep((current) => Math.min(current + 1, researchProgressSteps.length - 1))
    }, 2_200)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Partner research in progress"
      className="overflow-hidden rounded-xl border border-teal-200 bg-white shadow-sm"
    >
      <div className="relative flex items-center gap-4 px-4 py-4">
        <div aria-hidden="true" className="relative grid size-12 shrink-0 place-items-center">
          <span className="absolute inset-0 rounded-full border-2 border-teal-100 border-t-teal-600 animate-spin motion-reduce:animate-none" />
          <span className="absolute inset-2 rounded-full border border-cyan-200 border-b-cyan-600 animate-spin motion-reduce:animate-none [animation-direction:reverse] [animation-duration:1.6s]" />
          <span className="size-2 rounded-full bg-teal-600 animate-pulse motion-reduce:animate-none" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-950">Researching this partner</p>
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-700">Cross-checking sources</span>
          </div>
          <p key={step} className="mt-1 text-sm leading-5 text-zinc-600 animate-pulse motion-reduce:animate-none">
            {researchProgressSteps[step]}
          </p>
          <div aria-hidden="true" className="mt-3 flex gap-1.5">
            {researchProgressSteps.map((label, index) => (
              <span
                key={label}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${index <= step ? "bg-teal-600" : "bg-zinc-200"}`}
              />
            ))}
          </div>
        </div>
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gradient-to-r from-transparent via-teal-500 to-transparent animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  )
}

function PartnerResearchPanel({
  cities,
  formRef,
  onApplySocials,
  onApplyType,
  onApplyImages,
  onApplyMenu,
}: {
  cities: City[]
  formRef: RefObject<HTMLFormElement | null>
  onApplySocials: (socials: PartnerEnrichmentResult["socials"]) => void
  onApplyType: (type: string) => void
  onApplyImages: (images: PartnerEnrichmentResult["images"]) => void
  onApplyMenu: (menu: NonNullable<PartnerEnrichmentResult["menu"]>) => void
}) {
  const [target, setTarget] = useState("")
  const [result, setResult] = useState<PartnerEnrichmentResult | null>(null)
  const [message, setMessage] = useState("")
  const [providerWarning, setProviderWarning] = useState<GeminiProviderWarning | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isResearching, startResearch] = useTransition()

  const runResearch = () => {
    const form = formRef.current
    const name = formValue(form, "name")
    const website = formValue(form, "website")
    const address = formValue(form, "address")
    const citySelect = form?.elements.namedItem("city_id")
    const city = citySelect instanceof HTMLSelectElement
      ? citySelect.selectedOptions[0]?.textContent?.trim() ?? ""
      : ""

    setMessage("")
    setProviderWarning(null)
    setResult(null)
    setSelected(new Set())
    startResearch(async () => {
      const response = await researchPartner({
        target,
        name,
        website,
        address,
        city: city === "Select..." ? "" : city,
        allowedCities: cities.map((item) => item.name ?? "").filter(Boolean),
        allowedCategories: categoryOptions.map((item) => item.value),
        allowedTypes: partnerTypeOptions.map((item) => item.value),
      })

      setMessage(response.message)
      setProviderWarning(response.providerWarning ?? null)
      if (!response.ok) return

      setResult(response.result)
      setSelected(defaultEnrichmentSelections(response.result))
    })
  }

  const applySelected = () => {
    if (!result || !formRef.current) return
    const form = formRef.current
    let applied = 0

    for (const field of result.fields) {
      if (!selected.has(`field:${field.key}`)) continue
      if (field.key === "type") {
        onApplyType(field.value)
      } else if (field.key === "city") {
        const cityId = cities.find(
          (city) => city.name?.toLocaleLowerCase() === field.value.toLocaleLowerCase(),
        )?.id
        if (cityId) setNamedFormValue(form, "city_id", cityId)
      } else {
        setNamedFormValue(form, field.key, field.value)
      }
      applied += 1
    }

    for (const category of result.categories) {
      if (!selected.has(`category:${category.value}`)) continue
      const input = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="category"]'))
        .find((candidate) => candidate.value === category.value)
      if (input && !input.checked) input.click()
      applied += 1
    }

    const socials = result.socials.filter((social) =>
      selected.has(`social:${social.platform}`),
    )
    if (socials.length) {
      onApplySocials(socials)
      applied += socials.length
    }

    if (selected.has("opening-hours") && result.openingHours.length === 7) {
      applyResearchedOpeningHours(form, result.openingHours)
      applied += 1
    }

    const images = result.images.filter((image) =>
      selected.has(`image:${image.role}:${image.url}`),
    )
    if (images.length) {
      onApplyImages(images)
      applied += images.length
    }

    if (result.menu && selected.has("menu")) {
      onApplyMenu(result.menu)
      applied += result.menu.categories.reduce(
        (count, category) => count + category.items.length,
        0,
      )
    }

    setMessage(
      applied
        ? `Applied ${applied} reviewed suggestion${applied === 1 ? "" : "s"}. You can edit every value before creating the partner.`
        : "Select at least one suggestion to apply.",
    )
  }

  const toggleSelection = (key: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <section className="overflow-hidden rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-cyan-50 shadow-sm">
      <div className="border-b border-teal-100 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-base font-semibold text-zinc-950">Research partner online</h4>
              <span className="rounded-full border border-teal-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                Official web + maps + Gemini
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Find source-backed business details, then choose what to copy into this form. Nothing is saved or overwritten automatically.
            </p>
          </div>
          {result ? (
            <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${confidenceClasses(result.matchConfidence)}`}>
              {capitalize(result.matchConfidence)} match confidence
            </span>
          ) : null}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault()
            }}
            placeholder="Website, Google Maps link, or shop name and location"
            maxLength={500}
            className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          />
          <button
            type="button"
            onClick={runResearch}
            disabled={isResearching}
            className="h-10 shrink-0 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            <span className="inline-flex items-center gap-2">
              {isResearching ? <LoadingSpinner /> : null}
              {isResearching ? "Researching sources..." : result ? "Research again" : "Research partner"}
            </span>
          </button>
        </div>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          Tip: a canonical website or Google Maps link gives the strongest identity match. Research can take about a minute.
        </p>
      </div>

      {isResearching ? (
        <div className="px-4 py-3 sm:px-5">
          <ResearchingIndicator />
        </div>
      ) : null}

      {message && (!providerWarning || result) ? (
        <p
          role="status"
          aria-live="polite"
          className={`mx-4 mt-3 rounded-lg border px-3 py-2 text-sm sm:mx-5 ${result ? "border-teal-200 bg-white text-zinc-700" : "border-amber-200 bg-amber-50 text-amber-900"} ${!providerWarning && !result ? "mb-4 sm:mb-5" : ""}`}
        >
          {message}
        </p>
      ) : null}

      {providerWarning ? (
        <div
          role="alert"
          aria-live="assertive"
          className={`mx-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-amber-950 shadow-sm sm:mx-5 ${result ? "" : "mb-4 sm:mb-5"}`}
        >
          <div className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-amber-200 text-xs font-black">!</span>
            <div>
              <p className="text-sm font-semibold">{providerWarning.title}</p>
              <p className="mt-1 text-xs leading-5">{providerWarning.message}</p>
              {providerWarning.kind === "quota" ? (
                <p className="mt-1.5 text-xs font-semibold">
                  Free website/OpenStreetMap results may still appear below, but they do not include full Google-wide verification.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-4 p-4 sm:p-5">
          <p className="text-sm leading-6 text-zinc-700">{result.summary}</p>

          <div className="grid gap-2 lg:grid-cols-2">
            {result.fields.map((field) => (
              <EnrichmentSuggestion
                key={field.key}
                checked={selected.has(`field:${field.key}`)}
                confidence={field.confidence}
                label={enrichmentFieldLabels[field.key] ?? field.key}
                note={field.note}
                onToggle={() => toggleSelection(`field:${field.key}`)}
                sourceIds={field.sourceIds}
                sources={result.sources}
                value={field.value}
              />
            ))}
            {result.categories.map((category) => (
              <EnrichmentSuggestion
                key={`category-${category.value}`}
                checked={selected.has(`category:${category.value}`)}
                confidence={category.confidence}
                label="Category"
                onToggle={() => toggleSelection(`category:${category.value}`)}
                sourceIds={category.sourceIds}
                sources={result.sources}
                value={category.value}
              />
            ))}
            {result.socials.map((social) => (
              <EnrichmentSuggestion
                key={`social-${social.platform}`}
                checked={selected.has(`social:${social.platform}`)}
                confidence={social.confidence}
                label={`${capitalize(social.platform)} profile`}
                onToggle={() => toggleSelection(`social:${social.platform}`)}
                sourceIds={social.sourceIds}
                sources={result.sources}
                value={social.handle}
              />
            ))}
            {result.openingHours.length === 7 ? (
              <EnrichmentSuggestion
                checked={selected.has("opening-hours")}
                confidence={lowestHoursConfidence(result.openingHours)}
                label="Weekly opening hours"
                onToggle={() => toggleSelection("opening-hours")}
                sourceIds={[...new Set(result.openingHours.flatMap((hour) => hour.sourceIds))]}
                sources={result.sources}
                value={formatResearchedHours(result.openingHours)}
              />
            ) : null}
            {result.images.map((item) => (
              <label
                key={`image-${item.role}-${item.url}`}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${selected.has(`image:${item.role}:${item.url}`) ? "border-teal-300 bg-white shadow-sm" : "border-zinc-200 bg-white/60"}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(`image:${item.role}:${item.url}`)}
                  onChange={() => toggleSelection(`image:${item.role}:${item.url}`)}
                  className="mt-0.5 size-4 shrink-0 rounded border-zinc-300 accent-teal-700"
                />
                <span
                  role="img"
                  aria-label={item.alt || `${item.role} candidate`}
                  className="size-16 shrink-0 rounded-md border border-zinc-200 bg-zinc-50 bg-cover bg-center"
                  style={{ backgroundImage: `url(${JSON.stringify(item.url)})` }}
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-600">{capitalize(item.role)} image</span>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${confidenceClasses(item.confidence)}`}>{item.confidence}</span>
                  </span>
                  <span className="mt-1 block break-words text-xs leading-5 text-zinc-500">{item.alt || "Official image candidate"}</span>
                </span>
              </label>
            ))}
            {result.menu ? (
              <label className={`cursor-pointer rounded-lg border p-3 transition ${selected.has("menu") ? "border-teal-300 bg-white shadow-sm" : "border-zinc-200 bg-white/60"}`}>
                <span className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has("menu")}
                    onChange={() => toggleSelection("menu")}
                    className="mt-0.5 size-4 shrink-0 rounded border-zinc-300 accent-teal-700"
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-600">Official menu</span>
                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${confidenceClasses(result.menu.confidence)}`}>{result.menu.confidence}</span>
                    </span>
                    <span className="mt-1 block text-sm font-medium text-zinc-950">{result.menu.name}</span>
                    <span className="mt-1 block text-xs leading-5 text-zinc-500">
                      {result.menu.categories.length} categories · {result.menu.categories.reduce((count, category) => count + category.items.length, 0)} items · prices and images included where published
                    </span>
                  </span>
                </span>
              </label>
            ) : null}
          </div>

          {result.warnings.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Check before applying</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-5 text-amber-900">
                {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Sources reviewed</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {result.sources.map((source) => (
                <a
                  key={source.id}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:border-teal-300 hover:text-teal-800"
                >
                  <span className="shrink-0 text-zinc-400">{source.id}</span>
                  <span className="truncate">{source.title}</span>
                  <span className="shrink-0 text-[10px] uppercase text-zinc-400">{source.kind}</span>
                </a>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-teal-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-zinc-500">
              Low-confidence suggestions start unchecked. Existing form values are only changed when you apply a selected item.
            </p>
            <button
              type="button"
              onClick={applySelected}
              className="h-10 shrink-0 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Apply selected ({selected.size})
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function EnrichmentSuggestion({
  checked,
  confidence,
  label,
  note,
  onToggle,
  sourceIds,
  sources,
  value,
}: {
  checked: boolean
  confidence: "high" | "medium" | "low"
  label: string
  note?: string
  onToggle: () => void
  sourceIds: number[]
  sources: PartnerEnrichmentSource[]
  value: string
}) {
  const sourceTitles = sourceIds
    .map((id) => sources.find((source) => source.id === id)?.title)
    .filter(Boolean)
    .join(", ")

  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${checked ? "border-teal-300 bg-white shadow-sm" : "border-zinc-200 bg-white/60"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 size-4 shrink-0 rounded border-zinc-300 accent-teal-700"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-zinc-600">{label}</span>
          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${confidenceClasses(confidence)}`}>
            {confidence}
          </span>
        </span>
        <span className="mt-1 block break-words text-sm font-medium leading-5 text-zinc-950">{value}</span>
        {note ? <span className="mt-1 block text-xs leading-5 text-zinc-500">{note}</span> : null}
        {sourceTitles ? <span className="mt-1 block truncate text-[11px] text-zinc-400" title={sourceTitles}>Sources: {sourceTitles}</span> : null}
      </span>
    </label>
  )
}

function defaultEnrichmentSelections(result: PartnerEnrichmentResult) {
  const selected = new Set<string>()
  for (const field of result.fields) if (field.confidence !== "low") selected.add(`field:${field.key}`)
  for (const category of result.categories) if (category.confidence !== "low") selected.add(`category:${category.value}`)
  for (const social of result.socials) if (social.confidence !== "low") selected.add(`social:${social.platform}`)
  if (result.openingHours.length === 7 && lowestHoursConfidence(result.openingHours) !== "low") selected.add("opening-hours")
  for (const image of result.images) if (image.confidence !== "low") selected.add(`image:${image.role}:${image.url}`)
  if (result.menu && result.menu.confidence !== "low") selected.add("menu")
  return selected
}

function formValue(form: HTMLFormElement | null, name: string) {
  const field = form?.elements.namedItem(name)
  return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement
    ? field.value.trim()
    : ""
}

function setNamedFormValue(form: HTMLFormElement, name: string, value: string) {
  const field = form.elements.namedItem(name)
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return
  const prototype = field instanceof HTMLInputElement
    ? HTMLInputElement.prototype
    : field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLSelectElement.prototype
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value)
  field.dispatchEvent(new Event("input", { bubbles: true }))
  field.dispatchEvent(new Event("change", { bubbles: true }))
}

function applyResearchedOpeningHours(form: HTMLFormElement, hours: PartnerEnrichmentOpeningHour[]) {
  for (const hour of hours) {
    const closed = form.elements.namedItem(`is_closed_${hour.weekday}`)
    if (closed instanceof HTMLInputElement && closed.checked !== hour.isClosed) closed.click()
  }
  window.requestAnimationFrame(() => {
    for (const hour of hours) {
      if (hour.isClosed) continue
      setNamedFormValue(form, `opens_at_${hour.weekday}`, hour.opensAt)
      setNamedFormValue(form, `closes_at_${hour.weekday}`, hour.closesAt)
    }
  })
}

function lowestHoursConfidence(hours: PartnerEnrichmentOpeningHour[]) {
  return hours.some((hour) => hour.confidence === "low")
    ? "low" as const
    : hours.some((hour) => hour.confidence === "medium")
      ? "medium" as const
      : "high" as const
}

function formatResearchedHours(hours: PartnerEnrichmentOpeningHour[]) {
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  return hours.map((hour) => `${dayNames[hour.weekday - 1]} ${hour.isClosed ? "closed" : `${hour.opensAt}–${hour.closesAt}`}`).join(" · ")
}

function confidenceClasses(confidence: "high" | "medium" | "low") {
  return confidence === "high"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : confidence === "medium"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-rose-200 bg-rose-50 text-rose-800"
}

function capitalize(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value
}

function PartnerForm({
  partner,
  cities,
  formId,
  owners,
  mode,
  partners = [],
  portalMode = false,
}: {
  partner?: PartnerWithDeals
  cities: City[]
  formId?: string
  owners: OwnerOption[]
  mode: "create" | "edit"
  partners?: PartnerWithDeals[]
  portalMode?: boolean
}) {
  const [state, formAction] = useActionState(savePartner, initialState)
  const [descriptionState, setDescriptionState] = useState(initialState)
  const [isGeneratingDescription, startGeneratingDescription] = useTransition()
  const router = useRouter()
  const [descriptionDraft, setDescriptionDraft] = useState(
    () => partner?.description ?? "",
  )
  const [templateSource, setTemplateSource] =
    useState<PartnerWithDeals | null>(null)
  const [socialHandles, setSocialHandles] = useState<SocialHandleDraft[]>(() =>
    socialDraftsFromPartner(partner?.socials),
  )
  const [initialDeals, setInitialDeals] = useState<InitialDealDraft[]>([])
  const [initialMilestones, setInitialMilestones] = useState<
    InitialMilestoneDraft[]
  >(() => (mode === "create" ? [createInitialMilestoneDraft()] : []))
  const [initialMenuEnabled, setInitialMenuEnabled] = useState(false)
  const [initialMenuName, setInitialMenuName] = useState("Speisekarte")
  const [initialMenuDescription, setInitialMenuDescription] = useState("")
  const [initialMenuCategories, setInitialMenuCategories] = useState<
    InitialMenuCategoryDraft[]
  >([])
  const [initialMenuItems, setInitialMenuItems] = useState<
    InitialMenuItemDraft[]
  >([])
  const [researchedMedia, setResearchedMedia] = useState<ResearchedPartnerMedia>({
    logoUrl: "",
    featureUrl: "",
    discoverUrl: "",
    coverUrls: [],
  })
  const [createTab, setCreateTab] = useState<CreatePartnerTab>("profile")
  const [reviewSnapshot, setReviewSnapshot] =
    useState<CreatePartnerReviewSnapshot | null>(null)
  const [confirmingSave, setConfirmingSave] = useState(false)
  const [selectedOwnerId, setSelectedOwnerId] = useState(partner?.owner_id ?? "")
  const [validationMessage, setValidationMessage] = useState("")
  const [formVersion, setFormVersion] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const confirmedSubmitRef = useRef(false)
  const pendingSubmitterRef = useRef<HTMLButtonElement | null>(null)
  const partnerTypeDefault = normalizePartnerTypeValue(partner?.type)
  const [selectedPartnerType, setSelectedPartnerType] =
    useState(partnerTypeDefault)
  const cityOptions = withCurrentOption(
    cities.map((city) => ({
      value: city.id,
      label: city.name ?? city.id,
    })),
    partner?.city_id,
  )
  const ownerOptions = [
    ...withCurrentOption(
      owners.map((owner) => ({
      value: owner.id ?? owner.uid ?? "",
      label:
        [owner.display_name, owner.email].filter(Boolean).join(" - ") ||
        owner.id ||
        "Unnamed owner",
      })),
      partner?.owner_id,
    ),
    { value: CREATE_NEW_OWNER_VALUE, label: "Add new user" },
  ]
  const coordinateDefaultValue = formatPartnerCoordinates(partner)
  const menuSupported = partnerTypeSupportsMenu(selectedPartnerType)
  const createTabs: Array<{
    id: CreatePartnerTab
    label: string
    hasRequiredFields?: boolean
  }> = [
    { id: "profile", label: "Business Profile", hasRequiredFields: true },
    { id: "operations", label: "Operations & Media", hasRequiredFields: true },
    { id: "offers", label: "Rewards & Benefits", hasRequiredFields: true },
    ...(menuSupported
      ? [{ id: "menu" as const, label: "Starter Menu", hasRequiredFields: true }]
      : []),
    { id: "review", label: "Review & Create" },
  ]
  const activeCreateTabCopy = createPartnerTabCopy[createTab]
  const requiredSectionMarker: boolean | "subtle" = "subtle"
  const handlePartnerTypeChange = (nextType: string) => {
    setSelectedPartnerType(nextType)

    if (!partnerTypeSupportsMenu(nextType)) {
      setInitialMenuEnabled(false)
      if (createTab === "menu") setCreateTab("operations")
    }
  }

  const applyTemplate = (source: PartnerWithDeals) => {
    const nextType = normalizePartnerTypeValue(source.type)
    setTemplateSource(source)
    setDescriptionDraft(source.description ?? "")
    setSelectedPartnerType(nextType)
    setSocialHandles(socialDraftsFromPartner(source.socials))
    setInitialMilestones(
      source.reward_milestones.length > 0
        ? source.reward_milestones.map((milestone) => ({
            id: crypto.randomUUID(),
            active: milestone.active ?? true,
            audience: milestone.audience ?? DEFAULT_AUDIENCE,
            customerDescription: milestone.customer_description ?? "",
            discountValue: milestone.discount_value != null ? String(milestone.discount_value) : "",
            estimatedSavings: milestone.estimated_savings != null ? String(milestone.estimated_savings) : "",
            requiredStamps: milestone.required_stamps != null ? String(milestone.required_stamps) : String(MAX_STAMP_CARD_STAMPS),
            rewardItem: milestone.reward_item ?? "",
            rewardType: milestone.reward_type ?? "item",
            staffInstructions: milestone.staff_instructions ?? "",
            terms: milestone.terms ?? "",
            title: milestone.title ?? "",
          }))
        : [createInitialMilestoneDraft()],
    )
    if (!partnerTypeSupportsMenu(nextType)) {
      setInitialMenuEnabled(false)
    }
    setFormVersion((v) => v + 1)
  }

  useEffect(() => {
    if (state.ok) {
      formRef.current
        ?.querySelectorAll<HTMLDetailsElement>("details[open]")
        .forEach((details) => {
          details.open = false
        })

      router.refresh()
    }

    if (!(mode === "create" && state.ok && state.created)) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      setSocialHandles([])
      setDescriptionDraft("")
      setDescriptionState(initialState)
      setInitialDeals([])
      setInitialMilestones([createInitialMilestoneDraft()])
      setInitialMenuEnabled(false)
      setInitialMenuName("Speisekarte")
      setInitialMenuDescription("")
      setInitialMenuCategories([])
      setInitialMenuItems([])
      setResearchedMedia({ logoUrl: "", featureUrl: "", discoverUrl: "", coverUrls: [] })
      setCreateTab("profile")
      setSelectedOwnerId("")
      setReviewSnapshot(null)
      setTemplateSource(null)
      setFormVersion((value) => value + 1)

      document
        .getElementById("partners")
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [mode, router, state])

  const requestDescription = () => {
    const form = formRef.current
    if (!form || isGeneratingDescription) return

    // Do not forward the whole partner form here: it can contain large image
    // files, while the Content-Agent only needs the small public profile facts below.
    const formData = new FormData()
    for (const fieldName of ["name", "type", "city_id", "address", "description"]) {
      const field = form.elements.namedItem(fieldName)
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
      ) {
        formData.set(fieldName, field.value)
      }
    }

    const selectedCityId = String(formData.get("city_id") ?? "")
    const selectedCity = cityOptions.find((option) => option.value === selectedCityId)
    formData.set("city_name", selectedCity?.label ?? partner?.city_name ?? "")
    for (const category of form.querySelectorAll<HTMLInputElement>(
      'input[name="category"]:checked',
    )) {
      formData.append("category", category.value)
    }

    startGeneratingDescription(async () => {
      const result = await generatePartnerDescription(initialState, formData)
      setDescriptionState(result)
      if (result.ok && result.description) {
        setDescriptionDraft(result.description)
      }
    })
  }

  return (
    <form
      id={formId}
      key={formVersion}
      ref={formRef}
      action={formAction}
      className="space-y-3"
      noValidate
      onInput={() => {
        if (validationMessage) setValidationMessage("")
      }}
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter
        pendingSubmitterRef.current =
          submitter instanceof HTMLButtonElement ? submitter : null

        const form = event.currentTarget
        const invalidField = Array.from(form.elements).find(
          (element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
            element instanceof HTMLInputElement ||
            element instanceof HTMLSelectElement ||
            element instanceof HTMLTextAreaElement
              ? element.willValidate && !element.validity.valid
              : false,
        )

        if (invalidField) {
          event.preventDefault()
          pendingSubmitterRef.current = null
          const invalidTab = invalidField
            .closest<HTMLElement>("[data-create-tab]")
            ?.dataset.createTab as CreatePartnerTab | undefined
          const tabLabel = createTabs.find((tab) => tab.id === invalidTab)?.label

          if (mode === "create" && invalidTab) {
            setCreateTab(invalidTab)
          }

          const fieldLabel = invalidField.labels?.[0]?.firstElementChild?.textContent
            ?.replace(/\s+/g, " ")
            .replace(/\s*\*\s*$/, "")
            .trim()

          setValidationMessage(
            invalidField.validity.valueMissing
              ? tabLabel
                ? `Please complete the required fields in ${tabLabel} before creating the partner.`
                : "Please complete all required partner fields before saving."
              : `${fieldLabel ? `${fieldLabel}: ` : ""}${invalidField.validationMessage}`,
          )
          window.requestAnimationFrame(() => {
            const collapsedSection = invalidField.closest("details:not([open])")
            if (collapsedSection instanceof HTMLDetailsElement) {
              collapsedSection.open = true
            }
            invalidField.focus({ preventScroll: true })
            invalidField.scrollIntoView({ behavior: "smooth", block: "center" })
            invalidField.reportValidity()
          })
          return
        }

        if (mode === "create") {
          const submitted = new FormData(form)
          const ownerId = String(submitted.get("owner_id") ?? "").trim()
          const ownerEmail = String(submitted.get("new_owner_email") ?? "").trim()
          const ownerSelection = String(
            submitted.get("owner_selection") ?? "",
          ).trim()
          const hasExistingOwner = Boolean(ownerId && ownerSelection !== CREATE_NEW_OWNER_VALUE)
          const hasNewOwnerEmail = Boolean(ownerEmail)

          if (hasExistingOwner === hasNewOwnerEmail) {
            event.preventDefault()
            pendingSubmitterRef.current = null
            setCreateTab("profile")
            setValidationMessage(
              "Choose an existing partner owner or enter a new owner email, but not both.",
            )
            return
          }
        }

        if (mode === "create" && new FormData(form).getAll("category").length === 0) {
          event.preventDefault()
          pendingSubmitterRef.current = null
          setCreateTab("profile")
          setValidationMessage(
            "Please select at least one category in Business Profile before creating the partner.",
          )
          window.requestAnimationFrame(() => {
            form
              .querySelector<HTMLElement>("[data-create-tab='profile'] details:last-of-type")
              ?.scrollIntoView({ behavior: "smooth", block: "center" })
          })
          return
        }

        if (mode !== "edit") {
          return
        }

        if (confirmedSubmitRef.current) {
          confirmedSubmitRef.current = false
          pendingSubmitterRef.current = null
          return
        }

        event.preventDefault()
        setConfirmingSave(true)
      }}
    >
      <input type="hidden" name="id" value={partner?.id ?? ""} />
      <input type="hidden" name="existing_slug" value={partner?.slug ?? ""} />
  <input
    type="hidden"
    name="existing_subdomain"
    value={partner?.subdomain ?? ""}
  />
  <input
    type="hidden"
    name="existing_partner_email"
    value={partner?.email ?? ""}
  />
  <input type="hidden" name="existing_pin" value={partner?.pin ?? ""} />
      <input type="hidden" name="existing_loves" value={partner?.loves ?? 0} />
      <input
        type="hidden"
        name="existing_stamp_target"
        value={partner?.stamp_target ?? MAX_STAMP_CARD_STAMPS}
      />
      <input
        type="hidden"
        name="stamp_target"
        value={partner?.stamp_target ?? MAX_STAMP_CARD_STAMPS}
      />
      <input type="hidden" name="social_count" value={socialHandles.length} />

      {mode === "create" ? (
        <nav aria-label="Add partner steps">
          <div className="w-full overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex min-w-max divide-x divide-zinc-200">
              {createTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (tab.id === "review") {
                      setReviewSnapshot(
                        createPartnerReviewSnapshot(formRef.current, {
                          dealCount: initialDeals.length,
                          menuCategoryCount: initialMenuCategories.length,
                          menuEnabled: initialMenuEnabled,
                          menuItemCount: initialMenuItems.length,
                          milestoneCount: initialMilestones.length,
                        }),
                      )
                    }
                    setCreateTab(tab.id)
                  }}
                  title={tab.label}
                  aria-current={createTab === tab.id ? "step" : undefined}
                  className={`min-h-12 min-w-[8.5rem] flex-1 px-3 py-2.5 text-center text-[11px] font-semibold leading-4 transition whitespace-normal break-words sm:text-xs ${
                    createTab === tab.id
                      ? "bg-teal-700 text-white"
                      : "bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950"
                  }`}
                >
                  <span className="inline-flex max-w-full items-start justify-center gap-1 whitespace-normal break-words">
                    <span>{tab.label}</span>
                    {tab.hasRequiredFields ? (
                      <span
                        aria-hidden="true"
                        className="text-sm font-black leading-none text-rose-500"
                        title="Contains required fields"
                      >
                        *
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </nav>
      ) : null}

      <div className={mode === "create" ? "rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 sm:p-4" : "flex flex-col gap-4"}>
      {mode === "create" ? (
        <header className="mb-4 border-b border-zinc-200 pb-3">
          <h3 className="text-lg font-semibold tracking-tight text-zinc-950">
            {activeCreateTabCopy.title}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            {activeCreateTabCopy.description}
          </p>
        </header>
      ) : null}

      {validationMessage ? (
        <div
          role="alert"
          aria-live="polite"
          className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-800"
        >
          {validationMessage}
        </div>
      ) : null}
      <ActionMessage state={state} />

      <div
        data-create-tab="profile"
        className={mode !== "create" || createTab === "profile" ? "flex flex-col gap-4" : "hidden"}
      >

      {mode === "create" && partners.length > 0 ? (
        <CopyFromPartnerPanel partners={partners} onApply={applyTemplate} />
      ) : null}

      {mode === "create" ? (
        <PartnerResearchPanel
          cities={cities}
          formRef={formRef}
          onApplySocials={(socials) =>
            setSocialHandles((current) => {
              const next = new Map(current.map((social) => [social.platform, social]))
              for (const social of socials) {
                next.set(social.platform, {
                  id: crypto.randomUUID(),
                  platform: social.platform,
                  handle: social.handle,
                })
              }
              return [...next.values()].slice(0, MAX_PARTNER_SOCIALS)
            })
          }
          onApplyType={handlePartnerTypeChange}
          onApplyImages={(images) => {
            const logoUrl = images.find((image) => image.role === "logo")?.url ?? ""
            const coverUrls = images
              .filter((image) => image.role === "cover")
              .map((image) => image.url)
              .slice(0, maxCoverPhotos)
            setResearchedMedia((current) => ({
              logoUrl: logoUrl || current.logoUrl,
              featureUrl: coverUrls[0] || current.featureUrl,
              discoverUrl: coverUrls[1] || coverUrls[0] || current.discoverUrl,
              coverUrls: coverUrls.length ? coverUrls : current.coverUrls,
            }))
          }}
          onApplyMenu={(menu) => {
            handlePartnerTypeChange("Food & Drink")
            const categoryIds = new Map<string, string>()
            const categories = menu.categories.map((category, index) => {
              const id = crypto.randomUUID()
              categoryIds.set(category.name, id)
              return {
                id,
                imagePreviewUrl: category.imageUrl,
                name: category.name,
                sortOrder: String(index),
              }
            })
            const items = menu.categories.flatMap((category) =>
              category.items.map((item, index) => ({
                id: crypto.randomUUID(),
                categoryDraftId: categoryIds.get(category.name) ?? "",
                description: item.description,
                imagePreviewUrl: item.imageUrl,
                isPopular: false,
                name: item.name,
                price: item.price === null ? "" : String(item.price),
                currency: menu.currency || "EUR",
                tags: item.tags.join(", "),
                allergens: item.allergens.join(", "),
                sortOrder: String(index),
              })),
            )
            setInitialMenuName(menu.name || "Speisekarte")
            setInitialMenuDescription(menu.description)
            setInitialMenuCategories(categories)
            setInitialMenuItems(items)
            setInitialMenuEnabled(true)
          }}
        />
      ) : null}

      <FormSection title="Profile" required={requiredSectionMarker}>
        <FieldGrid>
          <TextField
            label="Partner name"
            name="name"
            defaultValue={partner?.name}
            required
            showCharacterCount={false}
          />
          <SelectField
            label="Partner type"
            name="type"
            value={selectedPartnerType}
            options={withCurrentOption(partnerTypeOptions, partnerTypeDefault)}
            onChange={handlePartnerTypeChange}
            required
          />
          <SelectField
            label="Partner city"
            name="city_id"
            defaultValue={partner?.city_id ?? templateSource?.city_id}
            options={cityOptions.length ? cityOptions : emptyCityOptions}
            required
          />
          {!portalMode ? (
            <>
              <input
                type="hidden"
                name="owner_id"
                value={selectedOwnerId === CREATE_NEW_OWNER_VALUE ? "" : selectedOwnerId}
              />
              <SelectField
                label="Partner owner"
                name="owner_selection"
                value={selectedOwnerId}
                options={ownerOptions}
                onChange={setSelectedOwnerId}
                hint="Choose an existing user, or choose Add new user to enter an email address."
              />
              {selectedOwnerId === CREATE_NEW_OWNER_VALUE ? (
                <TextField
                  label="New user email"
                  name="new_owner_email"
                  type="email"
                  hint="Saving creates the partner account, links it to this shop, and sends an invitation."
                  showCharacterCount={false}
                />
              ) : null}
            </>
          ) : null}
        </FieldGrid>
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckboxField
            label="Active"
            name="active"
            defaultChecked={partner ? isPartnerActive(partner) : true}
          />
          <CheckboxField
            label="Featured"
            name="is_featured"
            defaultChecked={partner?.is_featured ?? false}
          />
        </div>
        <TextAreaField
          label="Description"
          name="description"
          value={descriptionDraft}
          onChange={setDescriptionDraft}
          required
          labelAccessory={
            <GenerateDescriptionButton
              pending={isGeneratingDescription}
              onClick={requestDescription}
            />
          }
        />
        {descriptionState.message ? (
          <ActionMessage state={descriptionState} toast={false} />
        ) : null}
        <MultiSelectField
          label="Categories"
          name="category"
          defaultValues={normalizePartnerCategories(partner?.category ?? templateSource?.category)}
          options={withCurrentOptions(
            categoryOptions,
            normalizePartnerCategories(partner?.category ?? templateSource?.category),
          )}
          required
        />
      </FormSection>

      {mode === "edit" && partner?.id ? (
        <OpeningHoursPanel
          partner={partner}
          embedded
          withinPartnerForm
        />
      ) : null}

      <FormSection
        title="Contact, Location and Socials"
        defaultOpen={false}
        required={requiredSectionMarker}
      >
        <FieldGrid>
          <TextField
            label="Phone"
            name="phone"
            defaultValue={partner?.phone ?? templateSource?.phone}
            showCharacterCount={false}
          />
          <TextField
            label="Website"
            name="website"
            type="url"
            defaultValue={partner?.website ?? templateSource?.website}
            showCharacterCount={false}
          />
          <TextField
            key={`coordinates-${partner?.id ?? "new"}-${coordinateDefaultValue}`}
            label="Coordinates"
            name="coordinates"
            defaultValue={coordinateDefaultValue}
            placeholder="49.196197048340196, 8.115435101852437"
            hint="Copy the latitude and longitude from Google Maps and paste them here."
            required
            showCharacterCount={false}
          />
        </FieldGrid>
        <TextAreaField
          label="Address"
          name="address"
          defaultValue={partner?.address}
          required
        />
        <div className="border-t border-zinc-100 pt-3">
          <div className="mb-3 space-y-0.5">
            <p className="text-sm font-semibold text-zinc-900">Social media</p>
            <p className="text-xs leading-5 text-zinc-500">
              Optional. Add up to {MAX_PARTNER_SOCIALS} social profiles. Enter a
              handle or full profile URL and the partner record will store the
              canonical link automatically.
            </p>
          </div>
          <SocialHandlesSection
            rows={socialHandles}
            onAdd={() =>
              setSocialHandles((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  platform: "",
                  handle: "",
                },
              ])
            }
            onRemove={(id) =>
              setSocialHandles((current) =>
                current.filter((row) => row.id !== id),
              )
            }
            onUpdate={(id, values) =>
              setSocialHandles((current) =>
                current.map((row) =>
                  row.id === id ? { ...row, ...values } : row,
                ),
              )
            }
          />
        </div>
      </FormSection>

      </div>

      <div
        data-create-tab="operations"
        className={mode !== "create" || createTab === "operations" ? "flex flex-col gap-4" : "hidden"}
      >

      {mode === "create" ? (
        <FormSection
          title="Operating Hours"
          required={requiredSectionMarker}
        >
          <WeeklyHoursFields />
        </FormSection>
      ) : null}

      <FormSection
        title="Media"
        defaultOpen={false}
        status={{ label: "Recommended", tone: "recommended" }}
      >
        <div className="grid gap-4 lg:auto-rows-fr lg:grid-cols-3">
          <MediaUploadField
            key={`logo-${partner?.logo_url ?? "new"}`}
            label="Partner logo"
            fileName="logo_file"
            existingName="existing_logo_url"
            removeName="remove_logo"
            currentUrl={partner?.logo_url ?? researchedMedia.logoUrl}
            spec={partnerMediaSpecs.logo}
            compact
          />
          <MediaUploadField
            key={`feature-${partner?.feature_card_url ?? "new"}`}
            label="Feature card"
            fileName="feature_card_file"
            existingName="existing_feature_card_url"
            removeName="remove_feature_card"
            currentUrl={partner?.feature_card_url ?? researchedMedia.featureUrl}
            spec={partnerMediaSpecs.feature}
            compact
          />
          <MediaUploadField
            key={`discover-${partner?.discover_card_image_url ?? "new"}`}
            label="Discover page image"
            fileName="discover_card_file"
            existingName="existing_discover_card_image_url"
            removeName="remove_discover_card_image"
            currentUrl={partner?.discover_card_image_url ?? researchedMedia.discoverUrl}
            spec={partnerMediaSpecs.discover}
            compact
          />
        </div>
        <CoverUploadField
          key={`covers-${(partner?.cover_urls ?? researchedMedia.coverUrls).join("|") || "new"}`}
          covers={partner?.cover_urls ?? researchedMedia.coverUrls}
          partnerId={partner?.id}
        />
      </FormSection>

      </div>

      {mode === "create" ? (
        <div
          data-create-tab="offers"
          className={createTab === "offers" ? "flex flex-col gap-4" : "hidden"}
        >
          <FormSection
            title="Stamp-card milestones"
            required={requiredSectionMarker}
          >
            <input
              type="hidden"
              name="initial_milestone_count"
              value={initialMilestones.length}
            />
            <InitialMilestonesEditor
              milestones={initialMilestones}
              onAdd={() =>
                setInitialMilestones((current) => [
                  ...current,
                  createInitialMilestoneDraft(),
                ])
              }
              onRemove={(id) =>
                setInitialMilestones((current) =>
                  current.filter((milestone) => milestone.id !== id),
                )
              }
              onUpdate={(id, values) =>
                setInitialMilestones((current) =>
                  current.map((milestone) =>
                    milestone.id === id
                      ? { ...milestone, ...values }
                      : milestone,
                  ),
                )
              }
            />
          </FormSection>

          <FormSection
            title="Benefits"
            defaultOpen={false}
            status={{ label: "Recommended", tone: "recommended" }}
          >
            {initialDeals.length === 0 ? (
              <WarningNote>
              At least one benefit is recommended, but the partner can be
              created without benefits.
              </WarningNote>
            ) : null}
            <InitialDealsEditor
              deals={initialDeals}
              onAdd={() => {
                const id = crypto.randomUUID()

                setInitialDeals((current) => [
                  ...current,
                  {
                    id,
                    active: true,
                    benefitCategory: "direct_selectable",
                    dealType: "discount",
                    discountType: "percent",
                    rewardSummary: "percentage off",
                    title: defaultDealDraftTitle(),
                  },
                ])

                return id
              }}
              onRemove={(id) =>
                setInitialDeals((current) =>
                  current.filter((deal) => deal.id !== id),
                )
              }
              onUpdate={(id, values) =>
                setInitialDeals((current) =>
                  current.map((deal) => {
                    if (deal.id !== id) {
                      return deal
                    }

                    const nextDeal = { ...deal, ...values }

                    return nextDeal.title === deal.title &&
                      nextDeal.active === deal.active &&
                      nextDeal.dealType === deal.dealType
                      ? deal
                      : nextDeal
                  }),
                )
              }
            />
          </FormSection>

        </div>
      ) : null}

      {mode === "create" && menuSupported ? (
        <div
          data-create-tab="menu"
          className={createTab === "menu" ? "flex flex-col gap-4" : "hidden"}
        >
            <FormSection title="Menu">
              <InitialMenuEditor
                categories={initialMenuCategories}
                description={initialMenuDescription}
                enabled={initialMenuEnabled}
                items={initialMenuItems}
                name={initialMenuName}
                onDescriptionChange={setInitialMenuDescription}
                onNameChange={setInitialMenuName}
                onAddCategory={() =>
                  setInitialMenuCategories((current) => {
                    const normalized = normalizeInitialCategoryPositions(current)

                    return [
                      ...normalized,
                      {
                        id: crypto.randomUUID(),
                        imagePreviewUrl: "",
                        name: "",
                        sortOrder: String(
                          nextAvailablePosition(
                            normalized.map((category) => category.sortOrder),
                          ),
                        ),
                      },
                    ]
                  })
                }
                onAddItem={() =>
                  setInitialMenuItems((current) => {
                    const categoryDraftId =
                      sortInitialCategories(initialMenuCategories)[0]?.id ?? ""
                    const normalized = normalizeInitialItemPositions(current)

                    return [
                      ...normalized,
                      {
                        id: crypto.randomUUID(),
                        categoryDraftId,
                        description: "",
                        imagePreviewUrl: "",
                        isPopular: false,
                        name: "",
                        price: "",
                        currency: "EUR",
                        tags: "",
                        allergens: "",
                        sortOrder: String(
                          nextAvailablePosition(
                            normalized
                              .filter(
                                (item) =>
                                  item.categoryDraftId === categoryDraftId,
                              )
                              .map((item) => item.sortOrder),
                          ),
                        ),
                      },
                    ]
                  })
                }
                onRemoveCategory={(id) => {
                  setInitialMenuCategories((current) =>
                    normalizeInitialCategoryPositions(
                      current.filter((category) => category.id !== id),
                    ),
                  )
                  setInitialMenuItems((current) =>
                    normalizeInitialItemPositions(
                      current.map((item) =>
                        item.categoryDraftId === id
                          ? { ...item, categoryDraftId: "" }
                          : item,
                      ),
                    ),
                  )
                }}
                onRemoveItem={(id) =>
                  setInitialMenuItems((current) =>
                    normalizeInitialItemPositions(
                      current.filter((item) => item.id !== id),
                    ),
                  )
                }
                onReorderCategories={(orderedIds) =>
                  setInitialMenuCategories((current) =>
                    normalizeInitialCategoryPositions(
                      reorderRowsByIds(current, orderedIds),
                    ),
                  )
                }
                onReorderItems={(orderedIds) =>
                  setInitialMenuItems((current) =>
                    normalizeInitialItemPositions(
                      reorderRowsByIds(current, orderedIds),
                    ),
                  )
                }
                onSetEnabled={setInitialMenuEnabled}
                onUpdateCategory={(id, values) =>
                  setInitialMenuCategories((current) =>
                    current.map((category) =>
                      category.id === id ? { ...category, ...values } : category,
                    ),
                  )
                }
                onUpdateItem={(id, values) =>
                  setInitialMenuItems((current) =>
                    current.map((item) =>
                      item.id === id ? { ...item, ...values } : item,
                    ),
                  )
                }
              />
            </FormSection>
        </div>
      ) : null}

      <div className={mode === "create" && createTab === "review" ? "space-y-3" : mode === "create" ? "hidden" : "contents"}>
      {mode === "create" ? (
        <>
          <CreatePartnerReview snapshot={reviewSnapshot} />
          <PartnerPinDisplay mode="create" pin={partner?.pin ?? null} />
        </>
      ) : null}

      {mode === "create" ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <SubmitButton
            label="Add partner"
            pendingLabel="Adding partner..."
          />
        </div>
      ) : null}
      </div>
      {mode === "edit" ? (
        <div className="flex justify-end border-t border-zinc-200 pt-3">
          <SubmitButton label="Save partner" pendingLabel="Saving partner..." size="compact" />
        </div>
      ) : null}
      </div>
      <ConfirmDialog
        open={confirmingSave}
        title="Save partner changes?"
        description={`This will update ${partner?.name || "this partner"} with the current form values.`}
        confirmLabel="Save changes"
        onCancel={() => setConfirmingSave(false)}
        onConfirm={() => {
          confirmedSubmitRef.current = true
          setConfirmingSave(false)
          formRef.current?.requestSubmit(pendingSubmitterRef.current ?? undefined)
        }}
      />
    </form>
  )
}

function createPartnerReviewSnapshot(
  form: HTMLFormElement | null,
  staged: {
    dealCount: number
    menuCategoryCount: number
    menuEnabled: boolean
    menuItemCount: number
    milestoneCount: number
  },
): CreatePartnerReviewSnapshot | null {
  if (!form) return null

  const formData = new FormData(form)
  const value = (name: string) => String(formData.get(name) ?? "").trim()
  const selectedLabel = (name: string) => {
    const field = form.elements.namedItem(name)
    return field instanceof HTMLSelectElement
      ? field.selectedOptions[0]?.text.trim() || value(name)
      : value(name)
  }
  const requiredFields = Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input[required], select[required], textarea[required]",
    ),
  ).filter((field) => !field.disabled)
  const existingCovers = formData
    .getAll("existing_cover_urls")
    .filter((entry) => typeof entry === "string" && entry.trim()).length
  const uploadedCovers = formData
    .getAll("cover_files")
    .filter((entry) => entry instanceof File && entry.size > 0).length
  const categories = formData
    .getAll("category")
    .map(String)
    .map((category) => category.trim())
    .filter(Boolean)
  const mediaIsSet = (existingName: string, fileName: string) =>
    Boolean(value(existingName)) ||
    formData
      .getAll(fileName)
      .some((entry) => entry instanceof File && entry.size > 0)
  const menuStatus = !staged.menuEnabled
    ? "Not set"
    : staged.menuCategoryCount > 0 && staged.menuItemCount > 0
      ? "Set"
      : "Incomplete"

  return {
    name: value("name") || "Untitled partner",
    type: selectedLabel("type") || "Type not selected",
    city: selectedLabel("city_id") || "City not selected",
    owner: value("new_owner_email")
      ? `New account: ${value("new_owner_email")}`
      : selectedLabel("owner_selection") || "Owner not selected",
    email: value("email") || "Email not added",
    phone: value("phone") || "Phone not added",
    website: value("website") || "Website not added",
    address: value("address") || "Address not added",
    categories,
    active: formData.has("active"),
    featured: formData.has("is_featured"),
    requiredComplete:
      requiredFields.filter((field) => field.validity.valid).length +
      (categories.length ? 1 : 0),
    requiredTotal: requiredFields.length + 1,
    openDays: Array.from({ length: 7 }, (_, index) => index + 1).filter(
      (weekday) => !formData.has(`is_closed_${weekday}`),
    ).length,
    coverCount: existingCovers + uploadedCovers,
    milestoneCount: staged.milestoneCount,
    dealCount: staged.dealCount,
    menuStatus,
    logoSet: mediaIsSet("existing_logo_url", "logo_file"),
    featureCardSet: mediaIsSet("existing_feature_card_url", "feature_card_file"),
    discoveryImageSet: mediaIsSet(
      "existing_discover_card_image_url",
      "discover_card_file",
    ),
    descriptionSet: Boolean(value("description")),
    coordinatesSet: Boolean(value("coordinates")),
    socialCount: Number(value("social_count")) || 0,
  }
}

function CreatePartnerReview({
  snapshot,
}: {
  snapshot: CreatePartnerReviewSnapshot | null
}) {
  if (!snapshot) {
    return <InfoNote>Open this tab again to refresh the partner summary.</InfoNote>
  }

  const completion = snapshot.requiredTotal
    ? Math.round((snapshot.requiredComplete / snapshot.requiredTotal) * 100)
    : 100
  const ready = completion === 100 && snapshot.categories.length > 0

  return (
    <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="relative overflow-hidden bg-[linear-gradient(135deg,#118cff_0%,#0b75d9_52%,#061829_100%)] px-4 py-3 text-white sm:px-5">
        <div className="absolute -right-10 -top-16 size-36 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-100">
              Partner launch brief
            </p>
            <h4 className="mt-1 truncate text-lg font-bold tracking-tight">
              {snapshot.name}
            </h4>
            <p className="mt-0.5 text-xs text-teal-50/85">
              {snapshot.type} · {snapshot.city}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">
                {snapshot.active ? "Active on launch" : "Saved as inactive"}
              </span>
              {snapshot.featured ? (
                <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[11px] font-bold text-amber-950">
                  Featured
                </span>
              ) : null}
            </div>
          </div>
          <div
            className="grid size-16 shrink-0 place-items-center rounded-full p-1.5"
            style={{
              background: `conic-gradient(#8bcaff ${completion}%, rgba(255,255,255,.2) ${completion}% 100%)`,
            }}
          >
            <div className="grid size-full place-items-center rounded-full bg-teal-900 text-center">
              <span>
                <strong className="block text-base leading-none">{completion}%</strong>
                <span className="mt-0.5 block text-[8px] font-bold uppercase tracking-wide text-teal-100">
                  complete
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.1fr_.9fr]">
        <div className="p-4 sm:p-5">
          <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Business snapshot
          </h5>
          <dl className="mt-3 divide-y divide-zinc-100">
            <ReviewDetail label="Owner" value={snapshot.owner} />
            <ReviewDetail label="Email" value={snapshot.email} />
            <ReviewDetail label="Phone" value={snapshot.phone} />
            <ReviewDetail label="Website" value={snapshot.website} />
            <ReviewDetail label="Address" value={snapshot.address} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {snapshot.categories.length ? (
              snapshot.categories.map((category) => (
                <span
                  key={category}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-700"
                >
                  {category}
                </span>
              ))
            ) : (
              <span className="text-xs font-semibold text-rose-700">No categories selected</span>
            )}
          </div>
        </div>

        <div className="border-t border-zinc-200 bg-zinc-50/70 p-4 sm:p-5 lg:border-l lg:border-t-0">
          <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Launch inventory
          </h5>
          <div className="mt-3 grid gap-x-4 sm:grid-cols-2">
            <ReviewStatus label="Logo" value={snapshot.logoSet ? "Set" : "Not set"} ready={snapshot.logoSet} />
            <ReviewStatus label="Feature card" value={snapshot.featureCardSet ? "Set" : "Not set"} ready={snapshot.featureCardSet} />
            <ReviewStatus label="Discovery image" value={snapshot.discoveryImageSet ? "Set" : "Not set"} ready={snapshot.discoveryImageSet} />
            <ReviewStatus label="Cover gallery" value={snapshot.coverCount ? `${snapshot.coverCount} image${snapshot.coverCount === 1 ? "" : "s"}` : "Not set"} ready={snapshot.coverCount > 0} />
            <ReviewStatus label="Description" value={snapshot.descriptionSet ? "Set" : "Not set"} ready={snapshot.descriptionSet} />
            <ReviewStatus label="Map location" value={snapshot.coordinatesSet ? "Set" : "Not set"} ready={snapshot.coordinatesSet} />
            <ReviewStatus label="Opening hours" value={`${snapshot.openDays}/7 days open`} ready={snapshot.openDays > 0} />
            <ReviewStatus label="Social profiles" value={snapshot.socialCount ? `${snapshot.socialCount} set` : "Not set"} ready={snapshot.socialCount > 0} optional />
            <ReviewStatus label="Rewards" value={snapshot.milestoneCount ? `${snapshot.milestoneCount} milestone${snapshot.milestoneCount === 1 ? "" : "s"}` : "Not set"} ready={snapshot.milestoneCount > 0} optional />
            <ReviewStatus label="Deals" value={snapshot.dealCount ? `${snapshot.dealCount} deal${snapshot.dealCount === 1 ? "" : "s"}` : "Not set"} ready={snapshot.dealCount > 0} optional />
            <ReviewStatus label="Menu" value={snapshot.menuStatus} ready={snapshot.menuStatus === "Set"} optional={snapshot.menuStatus === "Not set"} />
          </div>
          <div
            className={`mt-5 rounded-lg border px-3 py-3 text-sm font-medium ${
              ready
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {ready
              ? "Ready to create. All required partner details are complete."
              : `${snapshot.requiredComplete} of ${snapshot.requiredTotal} required fields are complete. Review the marked tabs before creating.`}
          </div>
        </div>
      </div>
    </article>
  )
}

function ReviewDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[7rem_1fr] sm:gap-3">
      <dt className="text-xs font-semibold text-zinc-500">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-medium text-zinc-800">{value}</dd>
    </div>
  )
}

function ReviewStatus({
  label,
  value,
  ready,
  optional = false,
}: {
  label: string
  value: string
  ready: boolean
  optional?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-200 py-2">
      <span className="text-xs font-medium text-zinc-600">{label}</span>
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${ready ? "text-emerald-700" : optional ? "text-zinc-500" : "text-amber-700"}`}>
        <span className={`size-1.5 rounded-full ${ready ? "bg-emerald-500" : optional ? "bg-zinc-400" : "bg-amber-500"}`} />
        {value}
      </span>
    </div>
  )
}

function SocialHandlesSection({
  rows,
  onAdd,
  onRemove,
  onUpdate,
}: {
  rows: SocialHandleDraft[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, values: Partial<SocialHandleDraft>) => void
}) {
  return (
    <div className="space-y-3">
      {rows.length ? (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div
              key={row.id}
              className="grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50/70 p-2.5 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end"
            >
              <SelectField
                label="Platform"
                name={`social_${index}_platform`}
                value={row.platform}
                options={partnerSocialPlatformOptions}
                onChange={(platform) => onUpdate(row.id, { platform })}
                required
              />
              <TextField
                label="Handle or profile URL"
                name={`social_${index}_handle`}
                value={row.handle}
                onChange={(handle) => onUpdate(row.id, { handle })}
                placeholder="@benefitsi or profile URL"
                required
                showCharacterCount={false}
              />
              <button
                type="button"
                onClick={() => onRemove(row.id)}
                className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-300 px-3 py-3 text-center text-xs text-zinc-500">
          No social profiles added.
        </div>
      )}
      <button
        type="button"
        onClick={onAdd}
        disabled={rows.length >= MAX_PARTNER_SOCIALS}
        className="h-9 rounded-md border border-teal-700 bg-white px-3 text-sm font-semibold text-teal-800 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
      >
        Add social handle
      </button>
    </div>
  )
}

function InitialMilestonesEditor({
  milestones,
  onAdd,
  onRemove,
  onUpdate,
}: {
  milestones: InitialMilestoneDraft[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, values: Partial<InitialMilestoneDraft>) => void
}) {
  return (
    <div className="space-y-4">
      <InfoNote>
        At least one milestone is required before a partner can be created.
      </InfoNote>
      {milestones.map((milestone, index) => {
        const showsRewardItem = milestone.rewardType === "item"
        const showsDiscountValue =
          milestone.rewardType === "fixed" ||
          milestone.rewardType === "percent" ||
          milestone.rewardType === "bonus_stamp"

        return (
          <div
            key={milestone.id}
            className="rounded-lg border border-zinc-200 bg-white p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-zinc-900">
                Belohnungsstufe {index + 1}
              </p>
              {milestones.length > 1 ? (
                <button
                  type="button"
                  onClick={() => onRemove(milestone.id)}
                  className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                >
                  Entfernen
                </button>
              ) : null}
            </div>
            <FieldGrid>
              <TextField
                label="Required stamps"
                name={`initial_milestone_${index}_required_stamps`}
                type="number"
                min={1}
                max={MAX_STAMP_CARD_STAMPS}
                value={milestone.requiredStamps}
                onChange={(requiredStamps) =>
                  onUpdate(milestone.id, { requiredStamps })
                }
                required
              />
              <SelectField
                label="Belohnungstyp"
                name={`initial_milestone_${index}_reward_type`}
                value={milestone.rewardType}
                options={rewardTypeOptions}
                onChange={(rewardType) =>
                  onUpdate(milestone.id, {
                    rewardType,
                    rewardItem:
                      rewardType === "item" ? milestone.rewardItem : "",
                  })
                }
                required
              />
              <TextField
                label="Title"
                name={`initial_milestone_${index}_title`}
                value={milestone.title}
                onChange={(title) => onUpdate(milestone.id, { title })}
              />
              {showsRewardItem ? (
                <TextField
                  label="Artikelname"
                  name={`initial_milestone_${index}_reward_item`}
                  value={milestone.rewardItem}
                  onChange={(rewardItem) =>
                    onUpdate(milestone.id, { rewardItem })
                  }
                  required
                />
              ) : null}
              {showsDiscountValue ? (
                <TextField
                  label={
                    milestone.rewardType === "bonus_stamp"
                      ? "Bonus stamp count"
                      : "Discount value"
                  }
                  name={`initial_milestone_${index}_discount_value`}
                  type="number"
                  step="any"
                  value={milestone.discountValue}
                  onChange={(discountValue) =>
                    onUpdate(milestone.id, { discountValue })
                  }
                  required
                />
              ) : null}
              <TextField
                label="Estimated savings"
                name={`initial_milestone_${index}_estimated_savings`}
                type="number"
                step="any"
                value={milestone.estimatedSavings}
                onChange={(estimatedSavings) =>
                  onUpdate(milestone.id, { estimatedSavings })
                }
              />
              <SelectField
                label="Audience"
                name={`initial_milestone_${index}_audience`}
                value={milestone.audience}
                options={milestoneAudienceOptions}
                onChange={(audience) => onUpdate(milestone.id, { audience })}
                required
              />
            </FieldGrid>
            <div className="mt-4">
              <CheckboxField
                label="Active"
                name={`initial_milestone_${index}_active`}
                checked={milestone.active}
                onChange={(active) => onUpdate(milestone.id, { active })}
              />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <TextAreaField
                label="Customer description"
                name={`initial_milestone_${index}_customer_description`}
                value={milestone.customerDescription}
                onChange={(customerDescription) =>
                  onUpdate(milestone.id, { customerDescription })
                }
              />
              <TextAreaField
                label="Staff instructions"
                name={`initial_milestone_${index}_staff_instructions`}
                value={milestone.staffInstructions}
                onChange={(staffInstructions) =>
                  onUpdate(milestone.id, { staffInstructions })
                }
              />
              <TextAreaField
                label="Terms"
                name={`initial_milestone_${index}_terms`}
                value={milestone.terms}
                onChange={(terms) => onUpdate(milestone.id, { terms })}
              />
            </div>
          </div>
        )
      })}
      <button
        type="button"
        onClick={onAdd}
        className="h-10 rounded-md border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-800 transition hover:bg-teal-50"
      >
        Add another milestone
      </button>
    </div>
  )
}

function InitialDealsEditor({
  deals,
  onAdd,
  onRemove,
  onUpdate,
}: {
  deals: InitialDealDraft[]
  onAdd: () => string
  onRemove: (id: string) => void
  onUpdate: (id: string, values: Partial<InitialDealDraft>) => void
}) {
  const [expandedDealIds, setExpandedDealIds] = useState<string[]>([])
  const knownDealIdsRef = useRef<Set<string>>(new Set())
  const handleAdd = () => {
    const id = onAdd()

    setExpandedDealIds([id])
  }

  useEffect(() => {
    syncExpandedDraftIds(
      deals.map((deal) => deal.id),
      knownDealIdsRef,
      setExpandedDealIds,
    )
  }, [deals])

  return (
    <div className="space-y-4">
      <input type="hidden" name="initial_deal_count" value={deals.length} />
      {deals.length ? (
        <div className="space-y-3">
          {deals.map((deal, index) => {
            const expanded = expandedDealIds.includes(deal.id)

            return (
              <div
                key={deal.id}
                className="rounded-md border border-zinc-200 bg-white p-3"
              >
                <DealCardHeader
                  active={deal.active}
                  audienceLabel={dealAudienceValueLabel(deal.audience)}
                  benefitCategory={
                    deal.benefitCategory ??
                    draftDealBenefitCategory(deal.dealType, deal.discountType)
                  }
                  dealType={deal.dealType || "discount"}
                  typeLabel={
                    deal.dealType === "challenge" && deal.title
                      ? deal.title
                      : undefined
                  }
                  expanded={expanded}
                  onToggle={() =>
                    setExpandedDealIds((current) =>
                      toggleDraftId(current, deal.id),
                    )
                  }
                  title={`Vorteil ${index + 1}`}
                  rewardSummary={
                    deal.rewardSummary || deal.title || "Vorteil nicht eingerichtet"
                  }
                  actions={
                    <>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDealIds((current) =>
                          toggleDraftId(current, deal.id),
                        )
                      }
                      className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100"
                    >
                      {expanded ? "Einklappen" : "Bearbeiten"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(deal.id)}
                      className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                    >
                      Entfernen
                    </button>
                    </>
                  }
                />
                <div
                  className={
                    expanded
                      ? "mt-3 space-y-3 border-t border-zinc-200 pt-3"
                      : "hidden"
                  }
                >
                  <DealFields
                    prefix={`initial_deal_${index}_`}
                    defaultActive={deal.active}
                    onDraftTypeChange={(dealType) =>
                      onUpdate(deal.id, { dealType })
                    }
                    onDraftActiveChange={(active) =>
                      onUpdate(deal.id, { active })
                    }
                    onDraftMetaChange={(values) =>
                      onUpdate(deal.id, values)
                    }
                    onDraftTitleChange={(title) =>
                      onUpdate(deal.id, { title })
                    }
                    useBrowserValidation={false}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDealIds((current) =>
                          current.filter((id) => id !== deal.id),
                        )
                      }
                      className="h-9 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white transition hover:bg-teal-800"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={handleAdd}
                      className="h-9 rounded-md border border-teal-700 bg-white px-3 text-sm font-semibold text-teal-800 transition hover:bg-teal-50"
                    >
                      Add another
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-zinc-300 p-5 text-center text-sm text-zinc-600">
          No benefits staged.
        </div>
      )}
      <button
        type="button"
        onClick={handleAdd}
        className="h-10 rounded-md border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-800 transition hover:bg-teal-50"
      >
        Add benefit
      </button>
    </div>
  )
}

function InitialMenuEditor({
  categories,
  description,
  enabled,
  items,
  name,
  onAddCategory,
  onAddItem,
  onRemoveCategory,
  onRemoveItem,
  onReorderCategories,
  onReorderItems,
  onSetEnabled,
  onDescriptionChange,
  onNameChange,
  onUpdateCategory,
  onUpdateItem,
}: {
  categories: InitialMenuCategoryDraft[]
  description: string
  enabled: boolean
  items: InitialMenuItemDraft[]
  name: string
  onAddCategory: () => void
  onAddItem: () => void
  onRemoveCategory: (id: string) => void
  onRemoveItem: (id: string) => void
  onReorderCategories: (orderedIds: string[]) => void
  onReorderItems: (orderedIds: string[]) => void
  onSetEnabled: (enabled: boolean) => void
  onDescriptionChange: (description: string) => void
  onNameChange: (name: string) => void
  onUpdateCategory: (
    id: string,
    values: Partial<InitialMenuCategoryDraft>,
  ) => void
  onUpdateItem: (id: string, values: Partial<InitialMenuItemDraft>) => void
}) {
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<string[]>([])
  const [expandedItemIds, setExpandedItemIds] = useState<string[]>([])
  const [draggedCategoryId, setDraggedCategoryId] = useState("")
  const [draggedItemId, setDraggedItemId] = useState("")
  const knownCategoryIdsRef = useRef<Set<string>>(new Set())
  const knownItemIdsRef = useRef<Set<string>>(new Set())
  const orderedCategories = sortInitialCategories(categories)
  const orderedItems = sortInitialItems(items, categories)
  const categoryOptions = orderedCategories.map((category, index) => ({
    value: category.id,
    label: category.name || `Category ${index + 1}`,
  }))
  const handleAddCategory = () => {
    setExpandedCategoryIds([])
    onAddCategory()
  }
  const handleAddItem = () => {
    setExpandedItemIds([])
    onAddItem()
  }
  const handleCategoryDrop = (targetId: string) => {
    if (!draggedCategoryId || draggedCategoryId === targetId) {
      setDraggedCategoryId("")
      return
    }

    onReorderCategories(
      moveIdBeforeTarget(
        orderedCategories.map((category) => category.id),
        draggedCategoryId,
        targetId,
      ),
    )
    setDraggedCategoryId("")
  }
  const handleItemDrop = (targetId: string) => {
    if (!draggedItemId || draggedItemId === targetId) {
      setDraggedItemId("")
      return
    }

    onReorderItems(
      moveIdBeforeTarget(
        orderedItems.map((item) => item.id),
        draggedItemId,
        targetId,
      ),
    )
    setDraggedItemId("")
  }

  useEffect(() => {
    syncExpandedDraftIds(
      categories.map((category) => category.id),
      knownCategoryIdsRef,
      setExpandedCategoryIds,
    )
  }, [categories])

  useEffect(() => {
    syncExpandedDraftIds(
      items.map((item) => item.id),
      knownItemIdsRef,
      setExpandedItemIds,
    )
  }, [items])

  return (
    <div className="space-y-4">
      <label className="flex min-h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700">
        <input
          type="checkbox"
          name="initial_menu_enabled"
          checked={enabled}
          onChange={(event) => onSetEnabled(event.target.checked)}
          className="size-4 rounded border-zinc-300 accent-teal-700"
        />
        Create starter menu
      </label>

      {enabled ? (
        <div className="space-y-4">
          <input
            type="hidden"
            name="initial_menu_category_count"
            value={categories.length}
          />
          <input
            type="hidden"
            name="initial_menu_item_count"
            value={items.length}
          />
          <FieldGrid>
            <TextField
              label="Menu name"
              name="initial_menu_name"
              value={name}
              onChange={onNameChange}
              required
            />
            <SelectField
              label="Menu status"
              name="initial_menu_status"
              defaultValue={DEFAULT_MENU_STATUS}
              options={menuStatusOptions}
              required
            />
          </FieldGrid>
          <TextAreaField
            label="Menu description"
            name="initial_menu_description"
            value={description}
            onChange={onDescriptionChange}
          />

          <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3">
            <label htmlFor="initial-menu-import" className="block text-sm font-semibold text-zinc-900">
              Import menu <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <p className="text-xs leading-5 text-zinc-500">
              Select one or more menu JSON files and an optional assets manifest together. CSV remains supported. The menu name and status above remain required.
            </p>
            <input
              id="initial-menu-import"
              type="file"
              name="initial_menu_file"
              multiple
              accept=".json,.csv,application/json,text/csv"
              className="block w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-[#061829] file:px-3 file:py-1.5 file:font-semibold file:text-white"
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => downloadMenuTemplate("csv")} className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100">CSV template</button>
              <button type="button" onClick={() => downloadMenuTemplate("json")} className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100">JSON template</button>
            </div>
          </div>

          <div className="space-y-3 border-t border-zinc-200 pt-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-zinc-900">
                Categories
              </h4>
              <button
                type="button"
                onClick={handleAddCategory}
                className="h-8 rounded-md border border-teal-700 bg-white px-3 text-xs font-semibold text-teal-800 transition hover:bg-teal-50"
              >
                Add category
              </button>
            </div>
            {categories.length ? (
              <div className="space-y-3">
                {orderedCategories.map((category, index) => {
                  const expanded = expandedCategoryIds.includes(category.id)
                  const imageInputId = `initial-menu-category-image-${category.id}`

                  return (
                    <div
                      key={category.id}
                      draggable
                      onDragStart={() => setDraggedCategoryId(category.id)}
                      onDragEnd={() => setDraggedCategoryId("")}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => handleCategoryDrop(category.id)}
                      className={`rounded-md border border-zinc-200 bg-white p-3 transition ${
                        draggedCategoryId === category.id ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCategoryIds((current) =>
                              toggleDraftId(current, category.id),
                            )
                          }
                          className="min-w-0 text-left"
                          aria-expanded={expanded}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <ThumbnailPreview
                              alt={`${category.name || `Category ${index + 1}`} preview`}
                              src={category.imagePreviewUrl}
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-zinc-800">
                                {category.name || `Category ${index + 1}`}
                              </span>
                              <span className="mt-1 block text-xs text-zinc-500">
                                Position {category.sortOrder || "not set"}
                              </span>
                            </span>
                          </span>
                        </button>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCategoryIds((current) =>
                                toggleDraftId(current, category.id),
                              )
                            }
                            className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100"
                          >
                            {expanded ? "Collapse" : "Edit"}
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveCategory(category.id)}
                            className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <div
                        className={
                          expanded
                            ? "mt-3 space-y-3 border-t border-zinc-200 pt-3"
                            : "hidden"
                        }
                      >
                        <input
                          type="hidden"
                          name={`initial_menu_category_${index}_draft_id`}
                          value={category.id}
                        />
                        <FieldGrid>
                          <TextField
                            label="Name"
                            name={`initial_menu_category_${index}_name`}
                            value={category.name}
                            onChange={(value) =>
                              onUpdateCategory(category.id, { name: value })
                            }
                          />
                          <TextField
                            label="Position in menu"
                            name={`initial_menu_category_${index}_sort_order`}
                            type="number"
                            min={0}
                            value={category.sortOrder}
                            onChange={(value) =>
                              onUpdateCategory(category.id, {
                                sortOrder: value,
                              })
                            }
                            hint="Smaller numbers appear first."
                          />
                        </FieldGrid>
                        <MediaUploadField
                          key={`initial-menu-category-${category.id}`}
                          label="Menu category picture"
                          fileName={`initial_menu_category_${index}_image_file`}
                          existingName={`initial_menu_category_${index}_existing_image_url`}
                          removeName={`initial_menu_category_${index}_remove_image`}
                          currentUrl={category.imagePreviewUrl}
                          spec={partnerMediaSpecs.menuCategory}
                          compact
                          dense
                          inputId={imageInputId}
                          onPreviewChange={(imagePreviewUrl) =>
                            onUpdateCategory(category.id, { imagePreviewUrl })
                          }
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCategoryIds((current) =>
                                current.filter((id) => id !== category.id),
                              )
                            }
                            className="h-9 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white transition hover:bg-teal-800"
                          >
                            Done
                          </button>
                          <button
                            type="button"
                            onClick={handleAddCategory}
                            className="h-9 rounded-md border border-teal-700 bg-white px-3 text-sm font-semibold text-teal-800 transition hover:bg-teal-50"
                          >
                            Add another
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState>No starter categories staged.</EmptyState>
            )}
          </div>

          <div className="space-y-3 border-t border-zinc-200 pt-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-zinc-900">Items</h4>
              <button
                type="button"
                onClick={handleAddItem}
                className="h-8 rounded-md border border-teal-700 bg-white px-3 text-xs font-semibold text-teal-800 transition hover:bg-teal-50"
              >
                Add item
              </button>
            </div>
            {items.length ? (
              <div className="space-y-3">
                {orderedItems.map((item, index) => {
                  const expanded = expandedItemIds.includes(item.id)
                  const imageInputId = `initial-menu-item-image-${item.id}`
                  const categoryLabel =
                    labelForValue(categoryOptions, item.categoryDraftId) ||
                    "No category"

                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => setDraggedItemId(item.id)}
                      onDragEnd={() => setDraggedItemId("")}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => handleItemDrop(item.id)}
                      className={`rounded-md border border-zinc-200 bg-white p-3 transition ${
                        draggedItemId === item.id ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedItemIds((current) =>
                              toggleDraftId(current, item.id),
                            )
                          }
                          className="min-w-0 text-left"
                          aria-expanded={expanded}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span
                              onClick={(event) => {
                                event.stopPropagation()
                                setExpandedItemIds((current) =>
                                  current.includes(item.id)
                                    ? current
                                    : [...current, item.id],
                                )
                                document.getElementById(imageInputId)?.click()
                              }}
                              title="Change menu item image"
                            >
                              <ThumbnailPreview
                                alt={`${item.name || `Artikel ${index + 1}`} Vorschau`}
                                src={item.imagePreviewUrl}
                              />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-zinc-800">
                                {item.name || `Artikel ${index + 1}`}
                              </span>
                              <span className="mt-1 block text-xs text-zinc-500">
                                {categoryLabel} - Position{" "}
                                {item.sortOrder || "not set"}
                              </span>
                              <span className="mt-1 block truncate text-xs text-zinc-500">
                                {truncateText(item.description, 90) ||
                                  "No description"}
                              </span>
                            </span>
                          </span>
                        </button>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedItemIds((current) =>
                                toggleDraftId(current, item.id),
                              )
                            }
                            className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100"
                          >
                            {expanded ? "Collapse" : "Edit"}
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveItem(item.id)}
                            className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <div
                        className={
                          expanded
                            ? "mt-3 space-y-4 border-t border-zinc-200 pt-3"
                            : "hidden"
                        }
                      >
                        <input
                          type="hidden"
                          name={`initial_menu_item_${index}_draft_id`}
                          value={item.id}
                        />
                        <FieldGrid>
                          <TextField
                            label="Item name"
                            name={`initial_menu_item_${index}_name`}
                            value={item.name}
                            onChange={(value) =>
                              onUpdateItem(item.id, { name: value })
                            }
                          />
                          <SelectField
                            label="Category"
                            name={`initial_menu_item_${index}_category_draft_id`}
                            value={item.categoryDraftId}
                            options={categoryOptions}
                            onChange={(value) =>
                              onUpdateItem(item.id, {
                                categoryDraftId: value,
                                sortOrder: String(
                                  nextAvailablePosition(
                                    items
                                      .filter(
                                        (candidate) =>
                                          candidate.id !== item.id &&
                                          candidate.categoryDraftId === value,
                                      )
                                      .map(
                                        (candidate) => candidate.sortOrder,
                                      ),
                                  ),
                                ),
                              })
                            }
                          />
                          <TextField
                            label="Price"
                            name={`initial_menu_item_${index}_price`}
                            type="number"
                            step="0.01"
                            value={item.price}
                            onChange={(price) => onUpdateItem(item.id, { price })}
                          />
                          <SelectField
                            label="Currency"
                            name={`initial_menu_item_${index}_currency`}
                            value={item.currency}
                            options={menuCurrencyOptions}
                            onChange={(currency) => onUpdateItem(item.id, { currency })}
                            required
                          />
                          <TextField
                            label="Position in category"
                            name={`initial_menu_item_${index}_sort_order`}
                            type="number"
                            min={0}
                            value={item.sortOrder}
                            onChange={(value) =>
                              onUpdateItem(item.id, { sortOrder: value })
                            }
                            hint="Smaller numbers appear first."
                          />
                          <TextField
                            label="Tags"
                            name={`initial_menu_item_${index}_tags`}
                            value={item.tags}
                            onChange={(tags) => onUpdateItem(item.id, { tags })}
                            hint="Separate tags with commas."
                          />
                          <TextField
                            label="Allergens"
                            name={`initial_menu_item_${index}_allergens`}
                            value={item.allergens}
                            onChange={(allergens) => onUpdateItem(item.id, { allergens })}
                            hint="Separate allergens with commas."
                          />
                        </FieldGrid>
                        <TextAreaField
                          label="Description"
                          name={`initial_menu_item_${index}_description`}
                          value={item.description}
                          onChange={(value) =>
                            onUpdateItem(item.id, { description: value })
                          }
                        />
                        <MenuItemAddonsField
                          defaultValue={[]}
                          name={`initial_menu_item_${index}_addons`}
                        />
                        <label className="flex h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700">
                          <input
                            type="checkbox"
                            name={`initial_menu_item_${index}_is_popular`}
                            checked={item.isPopular}
                            onChange={(event) =>
                              onUpdateItem(item.id, {
                                isPopular: event.target.checked,
                              })
                            }
                            className="size-4 rounded border-zinc-300 accent-teal-700"
                          />
                          Popular
                        </label>
                        <MediaUploadField
                          key={`initial-menu-item-${item.id}`}
                          label="Menu item picture"
                          fileName={`initial_menu_item_${index}_image_file`}
                          existingName={`initial_menu_item_${index}_existing_image_url`}
                          removeName={`initial_menu_item_${index}_remove_image`}
                          currentUrl={item.imagePreviewUrl}
                          spec={partnerMediaSpecs.menuItem}
                          compact
                          inputId={imageInputId}
                          onPreviewChange={(imagePreviewUrl) =>
                            onUpdateItem(item.id, { imagePreviewUrl })
                          }
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedItemIds((current) =>
                                current.filter((id) => id !== item.id),
                              )
                            }
                            className="h-9 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white transition hover:bg-teal-800"
                          >
                            Done
                          </button>
                          <button
                            type="button"
                            onClick={handleAddItem}
                            className="h-9 rounded-md border border-teal-700 bg-white px-3 text-sm font-semibold text-teal-800 transition hover:bg-teal-50"
                          >
                            Add another
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState>No starter items staged.</EmptyState>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DealsPanel({
  partner,
  embedded = false,
}: {
  partner: PartnerWithDeals
  embedded?: boolean
}) {
  const [dealEditor, setDealEditor] = useState<DealEditorState | null>(null)
  const partnerId = partner.id ?? ""
  const hasDealRows = partner.deals.length > 0
  const dealCount = partner.deals.length
  const dealStatus: SectionStatusValue = hasDealRows
    ? [
        { label: "Recommended", tone: "recommended" },
        {
          label: `${dealCount} ${dealCount === 1 ? "deal" : "deals"}`,
          tone: "info",
        },
      ]
    : { label: "Recommended", tone: "recommended" }

  const content = (
    <div className="space-y-4">
      {!hasDealRows ? (
        <WarningNote>
          At least one benefit is recommended, but this partner can exist
          without benefits.
        </WarningNote>
      ) : null}
      {hasDealRows ? (
        <div className="space-y-3">
          {partner.deals.map((deal, index) => (
            <DealCard
              key={deal.id ?? `${deal.partner_id}-${deal.type}`}
              deal={deal}
              index={index}
              onEdit={() => setDealEditor({ mode: "edit", deal })}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-zinc-300 p-5 text-center text-sm text-zinc-600">
          No benefits staged.
        </div>
      )}
      {partnerId ? (
        <button
          type="button"
          onClick={() => setDealEditor({ mode: "create" })}
          className="h-10 rounded-md border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-800 transition hover:bg-teal-50"
        >
          Add benefit
        </button>
      ) : null}
      <DealEditorDialog
        editor={dealEditor}
        onClose={() => setDealEditor(null)}
        partnerId={partnerId}
        partnerName={partner.name ?? ""}
        visits={partner.visits}
      />
    </div>
  )

  if (embedded) {
    return content
  }

  return (
    <EditorShell
      title="Benefits"
      description="Configure selectable, automatic, and fallback benefits for the Supabase redemption flow."
      collapsible
      defaultOpen={false}
      status={dealStatus}
    >
      {content}
    </EditorShell>
  )
}

function DealCardHeader({
  actions,
  active,
  audienceLabel,
  benefitCategory,
  dealType,
  expanded,
  onToggle,
  rewardSummary,
  title,
  typeLabel,
}: {
  actions: ReactNode
  active: boolean
  audienceLabel: string
  benefitCategory: string
  dealType: string
  expanded: boolean
  onToggle: () => void
  rewardSummary: string
  title: string
  typeLabel?: string
}) {
  const displayTypeLabel =
    typeLabel || labelForValue(dealUiTypeOptions, dealType) || "Benefit"

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <button
          type="button"
          onClick={onToggle}
          className="min-w-0 text-left"
          aria-expanded={expanded}
        >
          <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
            {title}
          </span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-zinc-900">
            {displayTypeLabel}
          </span>
          <span className="mt-0.5 block truncate text-xs text-zinc-500">
            {rewardSummary}
          </span>
        </button>
        <div className="flex flex-wrap gap-1.5">
          <DealBadge tone={dealAudienceTone(audienceLabel)}>
            {audienceLabel}
          </DealBadge>
          <DealBadge>
            {labelForValue(benefitCategoryOptions, benefitCategory) ||
              "Benefit not set"}
          </DealBadge>
          <DealBadge tone={active ? "active" : "muted"}>
            {active ? "Active" : "Inactive"}
          </DealBadge>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
    </div>
  )
}

function DealBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "active" | "muted" | "free" | "premium" | "both"
}) {
  const toneClasses =
    tone === "active"
      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
      : tone === "free"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "premium"
        ? "border-amber-300 bg-amber-50 text-amber-800"
      : tone === "both"
        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
      : tone === "muted"
        ? "border-zinc-200 bg-zinc-50 text-zinc-500"
        : "border-zinc-200 bg-zinc-50 text-zinc-600"

  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[11px] font-medium leading-4 ${toneClasses}`}
    >
      {children}
    </span>
  )
}

function dealAudienceTone(
  label: string,
): "free" | "premium" | "both" {
  if (label === "Premium") return "premium"
  if (label === "Free") return "free"
  return "both"
}

function dealAudienceLabel(deal: Deal) {
  return dealAudienceValueLabel(
    deal.audience || (deal.premium_only ? "premium" : "both"),
  )
}

function dealAudienceValueLabel(audience = "both") {
  if (audience === "premium") return "Premium"
  if (audience === "free") return "Free"
  if (audience === "both") return "Free + Premium"
  if (audience === "free_trial_only") return "Nur Free-Testphase"

  return "Free + Premium"
}

function normalizeAudienceForEditor(audience?: string | null) {
  return audienceOptions.some((option) => option.value === audience)
    ? audience!
    : DEFAULT_AUDIENCE
}

function draftDealBenefitCategory(
  dealType?: string | null,
  discountType?: string | null,
) {
  const type = backendDealTypeForUi(dealType || "discount")
  const rewardType = discountType || defaultDiscountTypeForDealType(type, "")

  return inferBenefitCategory(type, rewardType)
}

function NewDealCard({
  deal,
  index,
  onAddAnother,
  onRemove,
  onSaved,
  onUpdate,
  partnerId,
  visits,
}: {
  deal: InitialDealDraft
  index: number
  onAddAnother: () => void
  onRemove: () => void
  onSaved: () => void
  onUpdate: (values: Partial<InitialDealDraft>) => void
  partnerId: string
  visits: Visit[]
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-xs">
      <DealCardHeader
        active={deal.active}
        audienceLabel={dealAudienceValueLabel(deal.audience)}
        benefitCategory={
          deal.benefitCategory ??
          draftDealBenefitCategory(deal.dealType, deal.discountType)
        }
        dealType={deal.dealType || "discount"}
        typeLabel={
          deal.dealType === "challenge" && deal.title ? deal.title : undefined
        }
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
        title={`Vorteil ${index + 1}`}
        rewardSummary={deal.rewardSummary || deal.title || "Vorteil nicht eingerichtet"}
        actions={
          <>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100"
          >
            {expanded ? "Einklappen" : "Bearbeiten"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
          >
            Entfernen
          </button>
          </>
        }
      />
      <div
        className={
          expanded
            ? "mt-3 space-y-3 border-t border-zinc-200 pt-3"
            : "hidden"
        }
      >
        <DealForm
          defaultActive={deal.active}
          footerAction={
            <button
              type="button"
              onClick={() => {
                setExpanded(false)
                onAddAnother()
              }}
              className="h-10 rounded-md border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-800 transition hover:bg-teal-50"
            >
              Add another
            </button>
          }
          mode="create"
          onDraftActiveChange={(active) => onUpdate({ active })}
          onDraftMetaChange={onUpdate}
          onDraftTypeChange={(dealType) => onUpdate({ dealType })}
          onDraftTitleChange={(title) => onUpdate({ title })}
          onSaved={onSaved}
          partnerId={partnerId}
          visits={visits}
        />
      </div>
    </div>
  )
}

function DealCard({
  deal,
  index,
  onEdit,
}: {
  deal: Deal
  index: number
  onEdit: () => void
}) {
  const isLimitedDrop = deal.type === "limited_drop"
  const soldOut =
    isLimitedDrop &&
    isSoldOutDealDrop(deal.stock_total ?? null, deal.stock_remaining ?? null)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button, form, a, input")) onEdit()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onEdit()
        }
      }}
      className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 shadow-xs transition hover:border-teal-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200"
    >
      <DealCardHeader
        active={deal.active ?? false}
        audienceLabel={dealAudienceLabel(deal)}
        benefitCategory={
          deal.benefit_category ??
          inferBenefitCategory(
            deal.type ?? "discount",
            normalizeDiscountTypeForUi(
              deal.type ?? "discount",
              deal.discount_type,
            ),
          )
        }
        dealType={dealUiTypeForDeal(deal)}
        typeLabel={dealCardTypeLabel(deal)}
        expanded={false}
        onToggle={onEdit}
        title={`Benefit ${index + 1}`}
        rewardSummary={formatDealRewardSummary(deal)}
        actions={
          deal.id ? (
            <DeleteDealForm
              dealId={deal.id}
              label="Remove"
              pendingLabel="Removing deal..."
              size="tiny"
              tone="outline"
            />
          ) : null
        }
      />

      {soldOut ? (
        <div className="mt-4">
          <WarningNote>
            This Deal Drop is sold out and users cannot redeem it.
          </WarningNote>
        </div>
      ) : null}

    </div>
  )
}

function DealEditorDialog({
  editor,
  onClose,
  partnerId,
  partnerName,
  visits,
}: {
  editor: DealEditorState | null
  onClose: () => void
  partnerId: string
  partnerName: string
  visits: Visit[]
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editor) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [editor, onClose])

  if (!editor || !partnerId) return null
  const deal = editor.mode === "edit" ? editor.deal : undefined

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#061829]/65 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="deal-dialog-title"
        className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:max-h-[90dvh] sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
          <div>
            <h3 id="deal-dialog-title" className="text-lg font-bold tracking-tight text-zinc-950">
              {deal ? "Edit benefit" : "Add benefit"}
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Configure the benefit and confirm before saving.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {deal?.id ? (
              <DeleteDealForm
                dealId={deal.id}
                label="Remove"
                size="tiny"
                onDeleted={onClose}
              />
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-9 place-items-center rounded-full border border-zinc-300 bg-white text-lg text-zinc-600 hover:bg-zinc-100"
            >
              ×
            </button>
          </div>
        </header>
        <div className="overflow-y-auto p-3 sm:p-4">
          <DealForm
            deal={deal}
            partnerName={partnerName}
            partnerId={partnerId}
            mode={deal ? "edit" : "create"}
            visits={visits}
            onCancel={onClose}
            onSaved={onClose}
          />
        </div>
      </section>
    </div>
  )
}

function DealFormShell({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-md border border-teal-200 bg-teal-50 p-4">
      <h3 className="mb-4 text-base font-semibold tracking-normal text-zinc-950">
        {title}
      </h3>
      {children}
    </div>
  )
}

function DealForm({
  deal,
  partnerName = "",
  defaultActive,
  footerAction,
  onCancel,
  onDraftActiveChange,
  onDraftMetaChange,
  onDraftTypeChange,
  onDraftTitleChange,
  onSaved,
  partnerId,
  mode,
  visits = [],
}: {
  deal?: Deal
  partnerName?: string
  defaultActive?: boolean
  footerAction?: ReactNode
  onCancel?: () => void
  onDraftActiveChange?: (active: boolean) => void
  onDraftMetaChange?: (values: Partial<InitialDealDraft>) => void
  onDraftTypeChange?: (dealType: string) => void
  onDraftTitleChange?: (title: string) => void
  onSaved?: () => void
  partnerId: string
  mode: "create" | "edit"
  visits?: Visit[]
}) {
  const [state, formAction] = useActionState(saveDeal, initialState)
  const formRef = useActionSuccess(state, onSaved)
  const [confirmingSave, setConfirmingSave] = useState(false)
  const confirmedSubmitRef = useRef(false)

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4"
      onSubmit={(event) => {
        if (confirmedSubmitRef.current) {
          confirmedSubmitRef.current = false
          return
        }

        event.preventDefault()
        setConfirmingSave(true)
      }}
    >
      <input type="hidden" name="id" value={deal?.id ?? ""} />
      <input type="hidden" name="partner_id" value={partnerId} />

      <DealFields
        deal={deal}
        dealDraft={state.dealDraft}
        partnerName={partnerName}
        defaultActive={defaultActive ?? deal?.active ?? true}
        onDraftActiveChange={onDraftActiveChange}
        onDraftMetaChange={onDraftMetaChange}
        onDraftTypeChange={onDraftTypeChange}
        onDraftTitleChange={onDraftTitleChange}
        visits={visits}
      />

      <ActionMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton
          label={mode === "create" ? "Add benefit" : "Save benefit"}
          pendingLabel={mode === "create" ? "Adding benefit..." : "Saving benefit..."}
        />
        {mode === "edit" && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100"
          >
            Cancel
          </button>
        ) : null}
        {footerAction}
      </div>
      <ConfirmDialog
        open={confirmingSave}
        title={mode === "create" ? "Add this benefit?" : "Save changes to this benefit?"}
        description="Review the reward, item, eligibility, dates, and limits before confirming."
        confirmLabel={mode === "create" ? "Add benefit" : "Save benefit"}
        onCancel={() => setConfirmingSave(false)}
        onConfirm={() => {
          confirmedSubmitRef.current = true
          setConfirmingSave(false)
          formRef.current?.requestSubmit()
        }}
      />
    </form>
  )
}

type DealFormField =
  | "challengeName"
  | "discountValue"
  | "rewardItem"
  | "benefitCount"
  | "estimatedSavings"
  | "happyHour"
  | "happyHourWeekdays"
  | "durationConfig"
  | "comebackCandidates"
  | "triggerValue"
  | "expiryDays"
  | "limitedWindow"

type DealTypeExplanation = {
  description: string
  shortDescription: string
  recommendedSetup: string[]
  requiredFields: string[]
  example: string
  autoSet: string[]
  important?: string
}

type DealFormConfig = {
  visibleFields: Set<DealFormField>
  requiredFields: Set<DealFormField>
  autoValues: {
    benefitCategory: string
    activationRequired: boolean
  }
  explanation: DealTypeExplanation
  discountOptions: { value: string; label: string }[]
  valueLabels: {
    discountValueLabel: string
    discountValuePlaceholder?: string
    discountValuePrefix?: string
    discountValueSuffix?: string
    discountValueHint?: string
  }
}

const dealFieldHelp = {
  dealType:
    "Legt Auslöser oder Kampagne fest, zum Beispiel Happy Hour, Willkommen, Comeback oder Streak.",
  discountType:
    "Legt fest, was Nutzer erhalten: Prozent- oder €-Rabatt, Gratisartikel, Bonusstempel oder 2 für 1.",
  benefitCategory:
    "Legt die Aktivierung fest: vor dem Besuch auswählen, automatisch beim Scan oder als Fallback.",
  audience:
    "Legt fest, wer diesen Vorteil nutzen kann: Free, Premium oder beide.",
  activationRequired:
    "Legt fest, ob der Vorteil vor dem Scan ausgewählt werden muss. Die Einstellung wird aus der Aktivierung abgeleitet.",
  discountValue:
    "Nur für prozentuale oder feste Rabatte. Prozent bedeutet %, fest bedeutet €.",
  rewardItem:
    "Name des Artikels, den das Personal ausgibt, zum Beispiel Gratisgetränk.",
  benefitCount: "Anzahl der zusätzlichen Bonusstempel.",
  estimatedSavings:
    "Geschätzter Geldwert für Ersparnisstatistik und Animation nach dem Scan.",
  expiryDays: "So viele Tage bleibt eine verdiente Belohnung gültig.",
  triggerValue:
    "Schwellenwert für den Auslöser, zum Beispiel Streak-Tage oder Challenge-Ziel.",
  challengeName:
    "Interner Name zur Unterscheidung mehrerer Challenges.",
  durationValue:
    "Belohnt Nutzer, die innerhalb dieses Zeitraums zurückkehren.",
  inactivityValue:
    "Belohnt inaktive Nutzer, die innerhalb dieses Zeitraums nicht zurückgekehrt sind.",
  stockTotal: "Gesamtzahl verfügbarer Einlösungen für diesen Deal Drop.",
  stockRemaining: "So viele Einlösungen sind noch verfügbar.",
  reserveOnSelection:
    "Reserviert das Kontingent vorübergehend, wenn ein Nutzer den Vorteil auswählt.",
  validWindow: "Zeitraum, in dem dieser Vorteil genutzt werden kann.",
  happyHour: "Tägliches Zeitfenster, in dem die Happy Hour verfügbar ist.",
  happyHourWeekdays:
    "Wähle die Tage für diese Happy Hour. Ohne Auswahl gilt sie täglich.",
  cooldownHours: "Mindestzeit, bevor derselbe Nutzer den Vorteil erneut nutzen kann.",
  maxRedemptionsGlobal: "Maximale Gesamtzahl aller Einlösungen.",
  maxRedemptionsPerUser: "Maximale Einlösungen pro Nutzer.",
  selectionExpiryMinutes:
    "So lange bleibt ein ausgewählter Vorteil vor dem QR-Scan gültig.",
  minSpend: "Erforderlicher Mindestbestellwert für diesen Vorteil.",
  maxDiscountAmount: "Maximaler Rabattbetrag bei prozentualen Rabatten.",
  rewardTrackTarget:
    "Für welchen Stempelkartenpfad dies gilt: Basis, Premium oder alle berechtigten Nutzer.",
  timezone: "Zeitzone für zeitbasierte Vorteile wie Happy Hour.",
  weekdays: "Wochentage, an denen dieser Vorteil verfügbar ist.",
  staffInstructions:
    "Wird dem Scan- und Kassenpersonal angezeigt.",
  customerDescription: "Wird Nutzern in der App und auf der Partnerseite angezeigt.",
  terms: "Bedingungen für diesen Vorteil.",
} as const

const dealExplanations: Record<string, DealTypeExplanation> = {
  two_for_one: {
    shortDescription:
      "Nutzer wählen den Vorteil vor dem Besuch aus und erhalten zwei Artikel zum Preis von einem.",
    description:
      "Ein direkt auswählbarer Vorteil: Nutzer erhalten zwei Artikel zum Preis von einem. Die Auswahl erfolgt vor dem QR-Scan; pro Besuch ist nur ein direkter Vorteil möglich.",
    recommendedSetup: [
      "Belohnungsformat: 2 für 1",
      "Aktivierung: Vor dem Besuch auswählen",
      "Aktivierung erforderlich: Ja",
    ],
    requiredFields: [
      "Zielgruppe",
      "Kundenbeschreibung",
      "Mitarbeiterhinweise",
      "Geschätzte Ersparnis",
      "Optionale Gültigkeit oder Limits",
    ],
    example: "Zwei Pizzen erhalten, eine bezahlen.",
    autoSet: [
      "type = two_for_one",
      "discount_type = 2for1",
      "benefit_category = direct_selectable",
      "activation_required = true",
    ],
  },
  welcome: {
    shortDescription:
      "Vorteil für den ersten Besuch. Je nach Belohnungsformat direkt auswählbar oder automatisch.",
    description:
      "Vorteil für den ersten Besuch oder die erste qualifizierte Interaktion. Der Auslöser heißt Willkommen; das Belohnungsformat bestimmt die konkrete Ausgabe.",
    recommendedSetup: [
      "Bonusstempel: automatisch beim Scan, keine Aktivierung",
      "Gratisartikel, Rabatt oder 2 für 1: vor dem Besuch auswählen",
    ],
    requiredFields: [
      "Belohnungsformat",
      "Zielgruppe",
      "Kundenbeschreibung",
      "Mitarbeiterhinweise",
      "Artikel, Rabattwert oder Anzahl Bonusstempel – abhängig vom Belohnungsformat",
    ],
    example: "Erster Besuch: Gratisgetränk oder +1 Bonusstempel.",
    autoSet: [
      "If discount_type = bonus_stamp: benefit_category = automatic_background; activation_required = false",
      "If discount_type = item/fixed/percent/2for1: benefit_category = direct_selectable; activation_required = true",
    ],
  },
  comeback: {
    shortDescription:
      "Zeitbonus für die Rückkehr innerhalb eines definierten Zeitraums.",
    description:
      "Belohnt Nutzer, die innerhalb eines festgelegten Zeitraums zurückkehren. Der Zeitbonus ist ein eigener automatischer Auslöser.",
    recommendedSetup: [
      "Bonusstempel: automatisch beim Scan, keine Aktivierung",
      "Direkte Vorteile: vor dem Besuch auswählen",
    ],
    requiredFields: [
      "Belohnungsformat",
      "Zeitraum und Einheit",
      "Gültigkeitstage bei Ablauf",
      "Kundenbeschreibung",
      "Mitarbeiterhinweise",
    ],
    example: "Innerhalb von 72 Stunden zurückkehren und +1 Bonusstempel erhalten.",
    autoSet: [
      "metadata.bonus_mode = duration_bonus",
      "If discount_type = bonus_stamp: benefit_category = automatic_background; activation_required = false",
      "If discount_type = item/fixed/percent/2for1: benefit_category = direct_selectable; activation_required = true",
    ],
    important: "Im Backend bleibt der Typ comeback; duration_bonus wird nicht als Typ gespeichert.",
  },
  comeback_inactive: {
    shortDescription:
      "Reaktiviert Nutzer, die für einen definierten Zeitraum nicht zurückgekehrt sind.",
    description:
      "Eine Reaktivierungskampagne für inaktive Nutzer. Der Auslöser heißt Comeback; das Belohnungsformat bestimmt die konkrete Ausgabe.",
    recommendedSetup: [
      "Inaktivitätszeitraum und optionale Besuchsfilter festlegen",
      "Vorschau nutzen, um passende Nutzer zu prüfen",
      "Bonusstempel sind automatisch; Artikel, Rabatt und 2 für 1 werden vorher ausgewählt",
    ],
    requiredFields: [
      "Inaktivitätszeitraum und Einheit",
      "Belohnungsformat",
      "Optionale Kandidatenfilter",
      "Kundenbeschreibung",
      "Mitarbeiterhinweise",
    ],
    example: "Nutzer ohne Besuch seit drei Wochen erhalten ein Gratisgetränk.",
    autoSet: [
      "type = comeback",
      "metadata.bonus_mode = comeback_inactive",
      "If discount_type = bonus_stamp: benefit_category = automatic_background; activation_required = false",
      "If discount_type = item/fixed/percent/2for1: benefit_category = direct_selectable; activation_required = true",
    ],
    important: "Wird mit Backend-Typ comeback und metadata.bonus_mode = comeback_inactive gespeichert.",
  },
  happy_hour: {
    shortDescription: "Nur im festgelegten Zeitfenster verfügbar.",
    description:
      "Eine zeitlich begrenzte Kampagne. Nutzer wählen den Vorteil vor dem QR-Scan aus; bei der Einlösung wird das Zeitfenster erneut geprüft.",
    recommendedSetup: [
      "Aktivierung: Vor dem Besuch auswählen",
      "Aktivierung erforderlich: Ja",
    ],
    requiredFields: [
      "Beginn der Happy Hour",
      "Ende der Happy Hour",
      "Belohnungsformat",
      "Rabattwert oder Artikel – abhängig vom Belohnungsformat",
      "Kundenbeschreibung",
      "Mitarbeiterhinweise",
    ],
    example: "10 % Rabatt zwischen 15:00 und 18:00 Uhr.",
    autoSet: [
      "type = happy_hour",
      "benefit_category = direct_selectable",
      "activation_required = true",
    ],
  },
  permanent_discount: {
    shortDescription:
      "Gilt automatisch nur, wenn kein direkter Vorteil ausgewählt wurde.",
    description:
      "Ein Dauerrabatt als automatischer Fallback. Er gilt nur, wenn kein anderer direkter Vorteil ausgewählt wurde und ist nicht kombinierbar.",
    recommendedSetup: [
      "Belohnungsformat: Prozentualer oder fester €-Rabatt",
      "Aktivierung: Automatisch als Fallback",
      "Aktivierung erforderlich: Nein",
    ],
    requiredFields: [
      "Rabattwert",
      "Zielgruppe",
      "Kundenbeschreibung",
      "Mitarbeiterhinweise",
      "Geschätzte Ersparnis",
    ],
    example:
      "Premium-Nutzer erhalten immer 5 % Rabatt, wenn sie keinen anderen Vorteil nutzen.",
    autoSet: [
      "type = permanent_discount",
      "benefit_category = automatic_fallback",
      "activation_required = false",
    ],
    important: "Als Dauerrabatt anzeigen.",
  },
  limited_drop: {
    shortDescription: "Zeitlich oder mengenmäßig begrenzt. Vor dem Besuch auswählen.",
    description:
      "Ein zeitlich oder mengenmäßig begrenzter direkter Vorteil. Nutzer wählen ihn vor dem QR-Scan aus. Er kann ablaufen oder ausverkauft sein.",
    recommendedSetup: [
      "Aktivierung: Vor dem Besuch auswählen",
      "Aktivierung erforderlich: Ja",
    ],
    requiredFields: [
      "Belohnungsformat",
      "Gesamtkontingent",
      "Verbleibendes Kontingent",
      "Gültig ab",
      "Gültig bis",
      "Kundenbeschreibung",
      "Mitarbeiterhinweise",
      "Geschätzte Ersparnis",
    ],
    example: "Heute sind nur 50 Gratisgetränke verfügbar.",
    autoSet: [
      "type = limited_drop",
      "benefit_category = direct_selectable",
      "activation_required = true",
    ],
  },
  birthday: {
    shortDescription:
      "Vorteil zum Geburtstag. Je nach Belohnungsformat direkt auswählbar oder automatisch.",
    description:
      "Ein Auslöser zum Geburtstag. Der Auslöser heißt Geburtstag; das Belohnungsformat bestimmt die konkrete Ausgabe.",
    recommendedSetup: [
      "Bonusstempel: automatisch beim Scan, keine Aktivierung",
      "Gratisartikel, Rabatt oder 2 für 1: vor dem Besuch auswählen",
    ],
    requiredFields: [
      "Belohnungsformat",
      "Zielgruppe",
      "Artikel, Rabattwert oder Anzahl Bonusstempel – abhängig vom Belohnungsformat",
      "Kundenbeschreibung",
      "Mitarbeiterhinweise",
    ],
    example: "Geburtstagswoche: Gratisdessert.",
    autoSet: [
      "If discount_type = bonus_stamp: benefit_category = automatic_background; activation_required = false",
      "If discount_type = item/fixed/percent/2for1: benefit_category = direct_selectable; activation_required = true",
    ],
  },
  free_item: {
    shortDescription:
      "Nutzer wählen diesen Vorteil vor dem Besuch aus und erhalten einen bestimmten Gratisartikel.",
    description:
      "Ein direkt auswählbarer Vorteil mit einem bestimmten Gratisartikel. Erfordert den Artikelnamen, keinen Rabattwert.",
    recommendedSetup: [
      "Belohnungsformat: Gratisartikel",
      "Aktivierung: Vor dem Besuch auswählen",
      "Aktivierung erforderlich: Ja",
    ],
    requiredFields: [
      "Artikelname",
      "Kundenbeschreibung",
      "Mitarbeiterhinweise",
      "Geschätzte Ersparnis",
    ],
    example: "Gratisgetränk zur Bestellung.",
    autoSet: [
      "type = free_item",
      "discount_type = item",
      "benefit_category = direct_selectable",
      "activation_required = true",
    ],
    important: "Keinen Rabattwert anzeigen. reward_item ist erforderlich.",
  },
  discount: {
    shortDescription:
      "Nutzer wählen diesen Vorteil vor dem Besuch aus. Nicht mit anderen direkten Vorteilen kombinierbar.",
    description:
      "Ein regulärer Rabatt, den Nutzer vor dem Besuch auswählen. Er kann prozentual oder als fester Betrag gelten und ist nicht kombinierbar.",
    recommendedSetup: [
      "Belohnungsformat: Prozentualer oder fester €-Rabatt",
      "Aktivierung: Vor dem Besuch auswählen",
      "Aktivierung erforderlich: Ja",
    ],
    requiredFields: [
      "Rabattwert",
      "Zielgruppe",
      "Kundenbeschreibung",
      "Mitarbeiterhinweise",
      "Geschätzte Ersparnis",
    ],
    example: "10 % Rabatt oder 5 € Rabatt.",
    autoSet: [
      "type = discount",
      "benefit_category = direct_selectable",
      "activation_required = true",
    ],
    important: "Als Rabatt anzeigen.",
  },
  bonus_stamp: {
    shortDescription:
      "Fügt beim Scan automatisch Zusatzstempel hinzu, wenn die Person berechtigt ist.",
    description:
      "Ein automatischer Vorteil, der bei der Einlösung Zusatzstempel hinzufügt. Nutzer wählen ihn nicht manuell aus.",
    recommendedSetup: [
      "Belohnungsformat: Bonusstempel",
      "Aktivierung: Automatisch beim Scan",
      "Aktivierung erforderlich: Nein",
    ],
    requiredFields: [
      "Anzahl Bonusstempel",
      "Zielgruppe",
      "Kundenbeschreibung",
      "Optionale Mitarbeiterhinweise",
    ],
    example: "+1 Bonusstempel heute.",
    autoSet: [
      "type = bonus_stamp",
      "discount_type = bonus_stamp",
      "benefit_category = automatic_background",
      "activation_required = false",
    ],
    important: "Keinen Rabattwert anzeigen. benefit_count ist erforderlich.",
  },
  streak: {
    shortDescription: "Bonus auf Basis einer Besuchsserie bei diesem Partner.",
    description:
      "Ein Streak auf Basis einer Besuchsserie. Die Belohnung kann Bonusstempel, Gratisartikel, festen oder prozentualen Rabatt oder 2 für 1 enthalten.",
    recommendedSetup: [
      "Auslöserwert ist erforderlich",
      "Bonusstempel werden automatisch angewendet",
      "Gratisartikel, Rabatt und 2 für 1 werden vor dem Besuch ausgewählt",
    ],
    requiredFields: [
      "Auslöserwert",
      "Belohnungsformat",
      "Anzahl, Artikel oder Rabattwert – abhängig vom Belohnungsformat",
      "Gültigkeitstage bei Ablauf",
      "Kundenbeschreibung",
      "Mitarbeiterhinweise",
    ],
    example: "3-Tage-Streak: Gratisgetränk oder 5-Tage-Streak: +1 Bonusstempel.",
    autoSet: [
      "If discount_type = bonus_stamp: benefit_category = automatic_background; activation_required = false",
      "If discount_type = item/fixed/percent/2for1: benefit_category = direct_selectable; activation_required = true",
    ],
  },
  challenge: {
    shortDescription: "Bonus für eine Challenge oder ein Ziel.",
    description:
      "Eine Challenge für eine Aufgabe oder ein Ziel. Je nach Belohnungsformat erfolgt die Belohnung automatisch oder wird vorher ausgewählt.",
    recommendedSetup: [
      "Der Challenge-Name unterscheidet Challenges intern",
      "Bonusstempel werden automatisch angewendet",
      "Gratisartikel, Rabatt und 2 für 1 werden vor dem Besuch ausgewählt",
      "Der Auslöserwert kann als Challenge-Ziel dienen",
    ],
    requiredFields: [
      "Challenge-Name",
      "Belohnungsformat",
      "Auslöserwert bei Nutzung als Challenge-Ziel",
      "Anzahl, Artikel oder Rabattwert – abhängig vom Belohnungsformat",
      "Kundenbeschreibung",
      "Mitarbeiterhinweise",
    ],
    example: "Drei Besuche in dieser Woche abschließen und ein Gratisgetränk erhalten.",
    autoSet: [
      "metadata.challenge_name stores the internal challenge name",
      "If discount_type = bonus_stamp: benefit_category = automatic_background; activation_required = false",
      "If discount_type = item/fixed/percent/2for1: benefit_category = direct_selectable; activation_required = true",
    ],
  },
}

const generalRewardOptions: { value: string; label: string }[] =
  discountTypeOptions.filter(
    (option) => option.value !== "none",
  )
const directRewardOptions: { value: string; label: string }[] =
  discountTypeOptions.filter((option) =>
    ["fixed", "percent", "item", "2for1"].includes(option.value),
  )
const discountOnlyOptions: { value: string; label: string }[] =
  discountTypeOptions.filter((option) =>
    ["fixed", "percent"].includes(option.value),
  )

function getDealFormConfig({
  type,
  discountType,
  benefitCategory,
}: {
  type: string
  discountType: string
  benefitCategory: string
}): DealFormConfig {
  const backendType = backendDealTypeForUi(type)
  const normalizedDiscountType = normalizeDiscountTypeForUi(
    backendType,
    discountType,
  )
  const visibleFields = new Set<DealFormField>()
  const requiredFields = new Set<DealFormField>()
  let discountOptions = generalRewardOptions

  switch (type) {
    case "two_for_one":
      discountOptions = discountTypeOptions.filter(
        (option) => option.value === "2for1",
      )
      visibleFields.add("estimatedSavings")
      break
    case "permanent_discount":
    case "discount":
      discountOptions = discountOnlyOptions
      break
    case "bonus_stamp":
      discountOptions = discountTypeOptions.filter(
        (option) => option.value === "bonus_stamp",
      )
      break
    case "free_item":
      discountOptions = discountTypeOptions.filter(
        (option) => option.value === "item",
      )
      break
    case "happy_hour":
      discountOptions = directRewardOptions
      visibleFields.add("happyHour")
      visibleFields.add("happyHourWeekdays")
      requiredFields.add("happyHour")
      break
    case "limited_drop":
      discountOptions = [...dealDropDiscountTypeOptions]
      visibleFields.add("limitedWindow")
      visibleFields.add("estimatedSavings")
      break
    case "streak":
      visibleFields.add("triggerValue")
      visibleFields.add("expiryDays")
      requiredFields.add("triggerValue")
      break
    case DURATION_BONUS_DEAL:
    case "comeback":
      visibleFields.add("durationConfig")
      visibleFields.add("expiryDays")
      requiredFields.add("durationConfig")
      break
    case COMEBACK_INACTIVE_DEAL:
      visibleFields.add("comebackCandidates")
      visibleFields.add("expiryDays")
      requiredFields.add("comebackCandidates")
      break
    case "challenge":
      visibleFields.add("challengeName")
      visibleFields.add("triggerValue")
      requiredFields.add("challengeName")
      requiredFields.add("triggerValue")
      break
  }

  if (normalizedDiscountType === "fixed" || normalizedDiscountType === "percent") {
    visibleFields.add("discountValue")
    requiredFields.add("discountValue")
  }

  if (normalizedDiscountType === "item") {
    visibleFields.add("rewardItem")
    visibleFields.add("estimatedSavings")
    requiredFields.add("rewardItem")
  }

  if (normalizedDiscountType === "bonus_stamp") {
    visibleFields.add("benefitCount")
    requiredFields.add("benefitCount")
  }

  if (normalizedDiscountType === "2for1") {
    visibleFields.add("rewardItem")
    visibleFields.add("estimatedSavings")
    requiredFields.add("rewardItem")
  }

  const normalizedBenefitCategory = normalizeBenefitCategory(
    backendType,
    normalizedDiscountType,
    benefitCategory,
  )

  return {
    visibleFields,
    requiredFields,
    autoValues: {
      benefitCategory: normalizedBenefitCategory,
      activationRequired: activationRequiredForCategory(
        normalizedBenefitCategory,
      ),
    },
    explanation: dealExplanations[type] ?? dealExplanations[backendType] ?? dealExplanations.discount,
    discountOptions,
    valueLabels: discountValueLabels(normalizedDiscountType),
  }
}

function discountValueLabels(discountType: string) {
  if (discountType === "percent") {
    return {
      discountValueLabel: "Discount percentage",
      discountValuePlaceholder: "10",
      discountValueSuffix: "%",
      discountValueHint: "Example: 10 = 10% off.",
    }
  }

  if (discountType === "fixed") {
    return {
      discountValueLabel: "Discount amount",
      discountValuePlaceholder: "5",
      discountValuePrefix: "€",
      discountValueHint: "Example: 5 = €5 off.",
    }
  }

  return {
    discountValueLabel: "Discount value",
    discountValueHint: dealFieldHelp.discountValue,
  }
}

function defaultDiscountTypeForDealType(type: string, currentDiscountType: string) {
  const backendType = backendDealTypeForUi(type)
  const current = normalizeDiscountTypeForUi(backendType, currentDiscountType)

  switch (backendType) {
    case "two_for_one":
      return "2for1"
    case "bonus_stamp":
      return "bonus_stamp"
    case "free_item":
      return "item"
    case "permanent_discount":
    case "discount":
      return current === "fixed" || current === "percent" ? current : "percent"
    case "happy_hour":
      return ["fixed", "percent", "item", "2for1"].includes(current)
        ? current
        : "percent"
    case "limited_drop":
      return ["fixed", "percent", "item", "2for1"].includes(current)
        ? current
        : "item"
    default:
      return current && current !== "none" ? current : "bonus_stamp"
  }
}

function normalizeDiscountTypeForUi(type: string, discountType?: string | null) {
  const backendType = backendDealTypeForUi(type)
  const value = discountType || ""

  if (backendType === "limited_drop") {
    return normalizeDealDropDiscountType(backendType, value || "item")
  }

  return value === "twoforone" ? "2for1" : value
}

function DealTypeDescription({
  explanation,
  typeLabel,
}: {
  explanation: DealTypeExplanation
  typeLabel: string
}) {
  return (
    <div className="space-y-1.5 text-xs">
      <p className="leading-5 text-zinc-600">
        <span className="font-semibold text-zinc-700">{typeLabel}:</span>{" "}
        {explanation.description}
      </p>
      <details className="text-zinc-600">
        <summary className="cursor-pointer list-none font-semibold text-teal-700 outline-none focus-visible:ring-2 focus-visible:ring-teal-100 [&::-webkit-details-marker]:hidden">
          More setup details
        </summary>
        <div className="mt-2 space-y-2 border-l border-zinc-200 pl-3 leading-5">
          <p>Example: {explanation.example}</p>
          {explanation.important ? <p>{explanation.important}</p> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <DealExplanationList
              title="Setup"
              items={explanation.recommendedSetup}
            />
            <DealExplanationList title="Auto-set" items={explanation.autoSet} />
          </div>
        </div>
      </details>
    </div>
  )
}

function DealExplanationList({
  title,
  items,
}: {
  title: string
  items: string[]
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
        {title}
      </p>
      <ul className="mt-1 space-y-1 text-xs leading-5 text-zinc-600">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

type DealValidationMessages = {
  benefitCount?: string
  challengeName?: string
  discountValue?: string
  durationValue?: string
  endsAt?: string
  happyHourEnd?: string
  happyHourStart?: string
  inactivityValue?: string
  minSpend?: string
  rewardItem?: string
  triggerValue?: string
  visitCountRange?: string
}

function buildDealValidationMessages({
  type,
  discountType,
  discountValue,
  minSpend,
  rewardItem,
  benefitCount,
  challengeName,
  durationValue,
  endsAt,
  happyHourStart,
  happyHourEnd,
  inactivityValue,
  maxVisitCount,
  minVisitCount,
  triggerValue,
}: {
  type: string
  discountType: string
  discountValue: string
  minSpend: string
  rewardItem: string
  benefitCount: string
  challengeName: string
  durationValue: string
  endsAt: string
  happyHourStart: string
  happyHourEnd: string
  inactivityValue: string
  maxVisitCount: string
  minVisitCount: string
  triggerValue: string
}): DealValidationMessages {
  const messages: DealValidationMessages = {}
  const parsedDiscountValue = parseOptionalNumberInput(discountValue)
  const parsedBenefitCount = parseOptionalNumberInput(benefitCount)
  const parsedDurationValue = parseOptionalNumberInput(durationValue)
  const parsedInactivityValue = parseOptionalNumberInput(inactivityValue)
  const parsedMinVisitCount = parseOptionalNumberInput(minVisitCount)
  const parsedMaxVisitCount = parseOptionalNumberInput(maxVisitCount)
  const parsedTriggerValue = parseOptionalNumberInput(triggerValue)

  if (discountType === "percent" && !parsedDiscountValue) {
    messages.discountValue = "Bitte einen Prozentsatz zwischen 1 und 100 eingeben."
  }

  if (discountType === "fixed" && !parsedDiscountValue) {
    messages.discountValue = "Bitte einen Betrag größer als 0 eingeben."
  }

  if (discountType === "percent" && parsedDiscountValue && parsedDiscountValue > 100) {
    messages.discountValue = "Bitte einen Prozentsatz zwischen 1 und 100 eingeben."
  }

  const parsedMinSpend = parseOptionalNumberInput(minSpend)
  if (
    discountType === "fixed" &&
    parsedMinSpend !== null &&
    parsedDiscountValue !== null &&
    parsedMinSpend < parsedDiscountValue
  ) {
    messages.minSpend =
      "Der Mindestbestellwert ist kleiner als der Rabattwert – Nutzer könnten mehr Rabatt erhalten als sie ausgeben."
  }

  if ((discountType === "item" || discountType === "2for1") && !rewardItem.trim()) {
    messages.rewardItem =
      discountType === "2for1"
        ? "Bitte den Artikel für 2 für 1 eingeben."
        : "Bitte den Namen des Gratisartikels eingeben."
  }

  if (discountType === "bonus_stamp" && !parsedBenefitCount) {
    messages.benefitCount = "Bitte mindestens 1 Bonusstempel eingeben."
  }

  if (type === "happy_hour" && !happyHourStart) {
    messages.happyHourStart = "Bitte eine Startzeit eingeben."
  }

  if (type === "happy_hour" && !happyHourEnd) {
    messages.happyHourEnd = "Bitte eine Endzeit eingeben."
  }

  if (
    (type === "streak" || type === "challenge") &&
    !parsedTriggerValue
  ) {
    messages.triggerValue = "Bitte einen Auslöserwert größer als 0 eingeben."
  }

  if (type === "challenge" && !challengeName.trim()) {
    messages.challengeName = "Bitte einen Challenge-Namen eingeben."
  }

  if (
    (type === DURATION_BONUS_DEAL || type === "comeback") &&
    !parsedDurationValue
  ) {
    messages.durationValue = "Bitte einen Zeitraum größer als 0 eingeben."
  }

  if (type === COMEBACK_INACTIVE_DEAL && !parsedInactivityValue) {
    messages.inactivityValue = "Bitte einen Inaktivitätszeitraum größer als 0 eingeben."
  }

  if (
    parsedMinVisitCount !== null &&
    parsedMaxVisitCount !== null &&
    parsedMaxVisitCount < parsedMinVisitCount
  ) {
    messages.visitCountRange = "Die maximale Besuchszahl muss mindestens der minimalen Besuchszahl entsprechen."
  }

  if (type === "limited_drop" && !endsAt) {
    messages.endsAt = "Deal Drops benötigen eine Endzeit."
  }

  return messages
}

function formatDraftRewardSummary(
  discountType: string,
  discountValue: number | null,
  rewardItem: string,
  benefitCount: number | null,
) {
  if (discountType === "percent") {
    return discountValue !== null ? `${discountValue} % Rabatt` : "Prozentualer Rabatt"
  }

  if (discountType === "fixed") {
    return discountValue !== null ? `${discountValue} € Rabatt` : "Fester €-Rabatt"
  }

  if (discountType === "item") {
    const item = normalizeRewardItem(rewardItem)
    return item ? `Gratis ${item}` : "Gratisartikel"
  }

  if (discountType === "bonus_stamp") {
    const count = benefitCount ?? 1
    return `+${count} Bonusstempel`
  }

  if (discountType === "2for1") {
    const item = normalizeRewardItem(rewardItem)
    return item ? `2 für 1 ${item}` : "2 für 1"
  }

  return "Kein direkter Vorteil"
}

function defaultDealDraftTitle() {
  return formatDealDisplayName({
    type: "discount",
    discountType: "percent",
    discountValue: null,
    rewardItem: "",
    benefitCount: null,
  })
}

function formatDealDisplayName({
  type,
  discountType,
  discountValue,
  rewardItem,
  benefitCount,
  typeLabel,
}: {
  type: string
  discountType: string
  discountValue: number | null
  rewardItem: string
  benefitCount: number | null
  typeLabel?: string
}) {
  const label = typeLabel || labelForValue(dealUiTypeOptions, type) || "Vorteil"
  const reward = formatDraftRewardSummary(
    discountType,
    discountValue,
    rewardItem,
    benefitCount,
  )

  // The reward format is the public title. Appending the technical trigger
  // created divergent labels such as "10 % Rabatt – Rabatt".
  return reward === "Kein direkter Vorteil" ? label : reward
}

function formatDealPublicSubtitle(discountType: string, rewardItem: string) {
  if (discountType === "2for1") {
    return "Zwei bekommen, eins bezahlen."
  }

  if (discountType === "item") {
    const item = normalizeRewardItem(rewardItem)
    return item ? `Gratis ${item}` : "Gratisartikel"
  }

  if (discountType === "bonus_stamp") {
    return "Bonus auf deine Stempelkarte"
  }

  return ""
}

function formatDealPublicTitle({
  type,
  discountType,
  discountValue,
  rewardItem,
  benefitCount,
  benefitCategory,
}: {
  type: string
  discountType: string
  discountValue: number | null
  rewardItem: string
  benefitCount: number | null
  benefitCategory?: string | null
}) {
  return formatBenefitTitle({
    type,
    discount_type: discountType,
    discount_value: discountValue,
    reward_item: rewardItem,
    benefit_count: benefitCount,
    benefit_category: benefitCategory,
  }, "de")
}

function normalizeRewardItem(value: string | null | undefined) {
  return (value?.trim() || "")
    .replace(/^(?:Gratisartikel|Free item)\s*[:\-–]?\s*/i, "")
    .replace(/^(?:Gratis|Free)\s+/i, "")
    .trim()
}

function DealFields({
  deal,
  dealDraft,
  partnerName = "",
  prefix = "",
  defaultActive,
  onDraftActiveChange,
  onDraftMetaChange,
  onDraftTypeChange,
  onDraftTitleChange,
  visits = [],
  useBrowserValidation = true,
}: {
  deal?: Deal
  dealDraft?: DealFormDraft
  partnerName?: string
  prefix?: string
  defaultActive: boolean
  onDraftActiveChange?: (active: boolean) => void
  onDraftMetaChange?: (values: Partial<InitialDealDraft>) => void
  onDraftTypeChange?: (dealType: string) => void
  onDraftTitleChange?: (title: string) => void
  visits?: Visit[]
  useBrowserValidation?: boolean
}) {
  const initialDealType = dealDraft?.dealConcept || dealUiTypeForDeal(deal)
  const initialBackendDealType = backendDealTypeForUi(initialDealType)
  const dealMetadata = metadataObject(deal?.metadata)
  const initialDiscountType =
    normalizeDiscountTypeForUi(
      initialBackendDealType,
      dealDraft?.discountType || deal?.discount_type,
    ) ||
    defaultDiscountTypeForDealType(initialBackendDealType, "")
  const [selectedDealType, setSelectedDealType] = useState(initialDealType)
  const [selectedDiscountType, setSelectedDiscountType] =
    useState(initialDiscountType)
  const [selectedBenefitCategory, setSelectedBenefitCategory] = useState(
    dealDraft
      ? inferBenefitCategory(initialBackendDealType, initialDiscountType)
      : deal?.benefit_category ??
        inferBenefitCategory(initialBackendDealType, initialDiscountType),
  )
  const [dealDropStockTotal, setDealDropStockTotal] = useState(
    formatTextInputValue(deal?.stock_total),
  )
  const [dealDropStockRemaining, setDealDropStockRemaining] = useState(
    formatTextInputValue(deal?.stock_remaining),
  )
  const [stockRemainingEdited, setStockRemainingEdited] = useState(
    deal?.stock_remaining !== null && deal?.stock_remaining !== undefined,
  )
  const [selectedAudience, setSelectedAudience] = useState(
    normalizeAudienceForEditor(dealDraft?.audience || deal?.audience),
  )
  const [active, setActive] = useState(defaultActive)
  const [discountValue, setDiscountValue] = useState(
    formatTextInputValue(deal?.discount_value),
  )
  const [rewardItem, setRewardItem] = useState(
    dealDraft?.rewardItem ?? deal?.reward_item ?? "",
  )
  const [rewardItemDirty, setRewardItemDirty] = useState(Boolean(dealDraft))
  const [customerDescription, setCustomerDescription] = useState(
    dealDraft?.customerDescription ?? deal?.customer_description ?? "",
  )
  const [customerDescriptionDirty, setCustomerDescriptionDirty] =
    useState(Boolean(dealDraft))
  const [staffInstructions, setStaffInstructions] = useState(
    dealDraft?.staffInstructions ?? deal?.staff_instructions ?? "",
  )
  const [staffInstructionsDirty, setStaffInstructionsDirty] = useState(
    Boolean(dealDraft),
  )
  const [terms, setTerms] = useState(dealDraft?.terms ?? deal?.terms ?? "")
  const [termsDirty, setTermsDirty] = useState(Boolean(dealDraft))
  const [displayTitle, setDisplayTitle] = useState(
    dealDraft?.displayTitle ?? deal?.public_title ?? deal?.display_title ?? "",
  )
  const [displaySubtitle, setDisplaySubtitle] = useState(
    dealDraft?.displaySubtitle ?? deal?.public_subtitle ?? deal?.display_subtitle ?? "",
  )
  const [displaySubtitleAuto, setDisplaySubtitleAuto] = useState(
    dealDraft?.displaySubtitleAuto ??
      (deal?.public_subtitle ?? deal?.display_subtitle) == null,
  )
  const [estimatedSavings, setEstimatedSavings] = useState(
    formatTextInputValue(deal?.estimated_savings),
  )
  const [benefitCount, setBenefitCount] = useState(
    formatTextInputValue(deal?.benefit_count ?? 1),
  )
  const [challengeName, setChallengeName] = useState(
    metadataString(dealMetadata, "challenge_name"),
  )
  const [durationValue, setDurationValue] = useState(
    formatTextInputValue(
      metadataNumber(dealMetadata, "duration_value") ??
        (initialDealType === DURATION_BONUS_DEAL ? deal?.trigger_value : null),
    ),
  )
  const [durationUnit, setDurationUnit] = useState(
    metadataString(dealMetadata, "duration_unit") || "hours",
  )
  const [inactivityValue, setInactivityValue] = useState(
    formatTextInputValue(
      metadataNumber(dealMetadata, "inactivity_value") ??
        (initialDealType === COMEBACK_INACTIVE_DEAL
          ? deal?.trigger_value
          : null),
    ),
  )
  const [inactivityUnit, setInactivityUnit] = useState(
    metadataString(dealMetadata, "inactivity_unit") || "weeks",
  )
  const [minVisitCount, setMinVisitCount] = useState(
    formatTextInputValue(metadataNumber(dealMetadata, "min_visit_count")),
  )
  const [maxVisitCount, setMaxVisitCount] = useState(
    formatTextInputValue(metadataNumber(dealMetadata, "max_visit_count")),
  )
  const [triggerValue, setTriggerValue] = useState(
    formatTextInputValue(deal?.trigger_value),
  )
  const [happyHourStart, setHappyHourStart] = useState(
    formatTextInputValue(deal?.happy_hour_start),
  )
  const [happyHourEnd, setHappyHourEnd] = useState(
    formatTextInputValue(deal?.happy_hour_end),
  )
  const [startsAt, setStartsAt] = useState(
    formatDateTimeInput(deal?.starts_at ?? deal?.valid_from),
  )
  const [endsAt, setEndsAt] = useState(
    formatDateTimeInput(deal?.ends_at ?? deal?.valid_until),
  )
  const [validFrom, setValidFrom] = useState(
    formatDateTimeInput(deal?.valid_from),
  )
  const [validUntil, setValidUntil] = useState(
    formatDateTimeInput(deal?.valid_until),
  )
  const [minSpend, setMinSpend] = useState(
    formatTextInputValue(deal?.min_spend),
  )
  const [expiryDays, setExpiryDays] = useState(
    formatTextInputValue(deal?.expiry_days),
  )
  const [allowFreeTrial, setAllowFreeTrial] = useState(
    deal?.allow_free_trial ?? false,
  )
  useEffect(() => {
    if (!dealDraft) return

    const nextDealType = dealDraft.dealConcept || initialDealType
    const nextBackendDealType = backendDealTypeForUi(nextDealType)
    const nextDiscountType =
      normalizeDiscountTypeForUi(
        nextBackendDealType,
        dealDraft.discountType,
      ) || defaultDiscountTypeForDealType(nextBackendDealType, "")
    const nextConfig = getDealFormConfig({
      type: nextDealType,
      discountType: nextDiscountType,
      benefitCategory:
        deal?.benefit_category ??
        inferBenefitCategory(nextBackendDealType, nextDiscountType),
    })
    const frame = window.requestAnimationFrame(() => {
      setSelectedDealType(nextDealType)
      setSelectedDiscountType(nextDiscountType)
      setSelectedBenefitCategory(nextConfig.autoValues.benefitCategory)
      setSelectedAudience(
        normalizeAudienceForEditor(dealDraft.audience || DEFAULT_AUDIENCE),
      )
      setRewardItem(dealDraft.rewardItem)
      setRewardItemDirty(true)
      setCustomerDescription(dealDraft.customerDescription)
      setCustomerDescriptionDirty(true)
      setStaffInstructions(dealDraft.staffInstructions)
      setStaffInstructionsDirty(true)
      setTerms(dealDraft.terms)
      setTermsDirty(true)
      setDisplayTitle(dealDraft.displayTitle)
      setDisplaySubtitle(dealDraft.displaySubtitle)
      setDisplaySubtitleAuto(dealDraft.displaySubtitleAuto)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [deal, dealDraft, initialDealType])
  const config = getDealFormConfig({
    type: selectedDealType,
    discountType: selectedDiscountType,
    benefitCategory: selectedBenefitCategory,
  })
  const selectedBackendDealType = backendDealTypeForUi(selectedDealType)
  const selectedDealTypeLabel =
    labelForValue(dealUiTypeOptions, selectedDealType) || "Benefit"
  const benefitCategory = config.autoValues.benefitCategory
  const activationRequired = config.autoValues.activationRequired
  const isLimitedDrop = selectedBackendDealType === "limited_drop"
  const isWelcomeDeal = selectedBackendDealType === "welcome"
  const isHappyHour = selectedBackendDealType === "happy_hour"
  const showsAllowFreeTrial =
    isLimitedDrop && selectedDiscountType === "2for1"
  const dealDropSoldOut =
    isLimitedDrop &&
    isSoldOutDealDrop(
      parseOptionalNumberInput(dealDropStockTotal),
      parseOptionalNumberInput(dealDropStockRemaining),
    )
  const validationMessages = buildDealValidationMessages({
    type: selectedDealType,
    discountType: selectedDiscountType,
    discountValue,
    minSpend,
    rewardItem,
    benefitCount,
    challengeName,
    durationValue,
    endsAt,
    happyHourStart,
    happyHourEnd,
    inactivityValue,
    maxVisitCount,
    minVisitCount,
    triggerValue,
  })
  const hasRewardDetails =
    config.visibleFields.has("challengeName") ||
    config.visibleFields.has("discountValue") ||
    config.visibleFields.has("rewardItem") ||
    config.visibleFields.has("benefitCount") ||
    config.visibleFields.has("estimatedSavings") ||
    config.visibleFields.has("happyHour") ||
    config.visibleFields.has("happyHourWeekdays") ||
    config.visibleFields.has("durationConfig") ||
    config.visibleFields.has("triggerValue") ||
    config.visibleFields.has("expiryDays") ||
    config.visibleFields.has("limitedWindow")
  const rewardDetailsRequired =
    config.requiredFields.has("challengeName") ||
    config.requiredFields.has("discountValue") ||
    config.requiredFields.has("rewardItem") ||
    config.requiredFields.has("benefitCount") ||
    config.requiredFields.has("happyHour") ||
    config.requiredFields.has("durationConfig") ||
    config.requiredFields.has("triggerValue")
  const emitDraftTitle = ({
    type = selectedDealType,
    discountType = selectedDiscountType,
    discountValueText = discountValue,
    rewardItemText = rewardItem,
    benefitCountText = benefitCount,
  }: {
    type?: string
    discountType?: string
    discountValueText?: string
    rewardItemText?: string
    benefitCountText?: string
  } = {}) => {
    const nextRewardSummary = formatDraftRewardSummary(
      discountType,
      parseOptionalNumberInput(discountValueText),
      rewardItemText,
      parseOptionalNumberInput(benefitCountText),
    )

    onDraftMetaChange?.({ rewardSummary: nextRewardSummary })
    onDraftTitleChange?.(
      formatDealDisplayName({
        type,
        discountType,
        discountValue: parseOptionalNumberInput(discountValueText),
        rewardItem: rewardItemText,
        benefitCount: parseOptionalNumberInput(benefitCountText),
      }),
    )
  }

  const [dealCopyState, setDealCopyState] = useState<PartnerActionState>(initialState)
  const [isGeneratingDealCopy, startGeneratingDealCopy] = useTransition()
  const requestDealCopy = (field: DealCopyField) => {
    if (isGeneratingDealCopy || !partnerName.trim()) return

    const formData = new FormData()
    formData.set("field", field)
    formData.set("partner_name", partnerName)
    formData.set("deal_concept", selectedDealType)
    formData.set("discount_type", selectedDiscountType)
    formData.set("audience", selectedAudience)
    formData.set("reward_item", rewardItem)
    formData.set(
      "current_text",
      field === "customer_description"
        ? customerDescription
        : field === "staff_instructions"
          ? staffInstructions
          : terms,
    )

    startGeneratingDealCopy(async () => {
      const result = await generateDealCopy(initialState, formData)
      setDealCopyState(result)

      if (!result.ok || !result.description) return

      if (field === "customer_description") {
        setCustomerDescription(result.description)
        setCustomerDescriptionDirty(true)
      } else if (field === "staff_instructions") {
        setStaffInstructions(result.description)
        setStaffInstructionsDirty(true)
      } else {
        setTerms(result.description)
        setTermsDirty(true)
      }
    })
  }

  const applyConfigSideEffects = (nextConfig: DealFormConfig) => {
    if (!nextConfig.visibleFields.has("challengeName")) {
      setChallengeName("")
    }

    if (!nextConfig.visibleFields.has("discountValue")) {
      setDiscountValue("")
    }

    if (!nextConfig.visibleFields.has("rewardItem")) {
      setRewardItem("")
    } else if (!rewardItemDirty && !rewardItem && deal?.reward_item) {
      setRewardItem(deal.reward_item)
    }

    if (!nextConfig.visibleFields.has("benefitCount")) {
      setBenefitCount("")
    } else if (!benefitCount) {
      setBenefitCount("1")
    }

    if (!nextConfig.visibleFields.has("estimatedSavings")) {
      setEstimatedSavings("")
    }

    if (!nextConfig.visibleFields.has("happyHour")) {
      setHappyHourStart("")
      setHappyHourEnd("")
    }

    if (!nextConfig.visibleFields.has("durationConfig")) {
      setDurationValue("")
      setDurationUnit("hours")
    }

    if (!nextConfig.visibleFields.has("comebackCandidates")) {
      setInactivityValue("")
      setInactivityUnit("weeks")
      setMinVisitCount("")
      setMaxVisitCount("")
    }

    if (!nextConfig.visibleFields.has("triggerValue")) {
      setTriggerValue("")
    }

    if (!nextConfig.visibleFields.has("limitedWindow")) {
      setStartsAt("")
      setEndsAt("")
    }

    if (!nextConfig.visibleFields.has("expiryDays")) {
      setExpiryDays("")
    }
  }

  const handleDealTypeChange = (value: string) => {
    const nextDiscountType = defaultDiscountTypeForDealType(
      value,
      selectedDiscountType,
    )
    const nextConfig = getDealFormConfig({
      type: value,
      discountType: nextDiscountType,
      benefitCategory: selectedBenefitCategory,
    })

    setSelectedDealType(value)
    setSelectedDiscountType(nextDiscountType)
    setSelectedBenefitCategory(nextConfig.autoValues.benefitCategory)
    applyConfigSideEffects(nextConfig)
    onDraftTypeChange?.(value)
    onDraftMetaChange?.({
      benefitCategory: nextConfig.autoValues.benefitCategory,
      dealType: value,
      discountType: nextDiscountType,
    })
    emitDraftTitle({ type: value, discountType: nextDiscountType })
  }

  const handleDiscountTypeChange = (value: string) => {
    const nextDiscountType = normalizeDiscountTypeForUi(
      selectedDealType,
      value,
    )
    const nextConfig = getDealFormConfig({
      type: selectedDealType,
      discountType: nextDiscountType,
      benefitCategory: selectedBenefitCategory,
    })

    setSelectedDiscountType(nextDiscountType)
    setSelectedBenefitCategory(nextConfig.autoValues.benefitCategory)
    applyConfigSideEffects(nextConfig)
    onDraftMetaChange?.({
      benefitCategory: nextConfig.autoValues.benefitCategory,
      discountType: nextDiscountType,
    })
    emitDraftTitle({ discountType: nextDiscountType })
  }

  const generatedDisplayTitle = formatDealPublicTitle({
    type: selectedDealType,
    discountType: selectedDiscountType,
    discountValue: parseOptionalNumberInput(discountValue),
    rewardItem,
    benefitCount: parseOptionalNumberInput(benefitCount),
    benefitCategory,
  })
  const generatedDisplaySubtitle = formatDealPublicSubtitle(
    selectedDiscountType,
    rewardItem,
  )

  return (
    <div className="space-y-4">
      <input
        type="hidden"
        name={`${prefix}metadata`}
        value={formatMetadataInput(deal?.metadata)}
      />
      <input
        type="hidden"
        name={`${prefix}type`}
        value={selectedBackendDealType}
      />
      <input
        type="hidden"
        name={`${prefix}selection_expires_minutes`}
        value={DEFAULT_SELECTION_EXPIRES_MINUTES}
      />
      <input
        type="hidden"
        name={`${prefix}reward_track_target`}
        value={deal?.reward_track_target ?? DEFAULT_REWARD_TRACK_TARGET}
      />
      <input
        type="hidden"
        name={`${prefix}priority`}
        value={deal?.priority ?? ""}
      />
      {deal?.id ? (
        <>
          <input
            type="hidden"
            name={`${prefix}original_customer_description`}
            value={deal.customer_description ?? ""}
          />
          <input
            type="hidden"
            name={`${prefix}original_staff_instructions`}
            value={deal.staff_instructions ?? ""}
          />
          <input
            type="hidden"
            name={`${prefix}original_terms`}
            value={deal.terms ?? ""}
          />
          <input
            type="hidden"
            name={`${prefix}original_reward_item`}
            value={deal.reward_item ?? ""}
          />
          <input
            type="hidden"
            name={`${prefix}customer_description_dirty`}
            value={customerDescriptionDirty ? "true" : "false"}
          />
          <input
            type="hidden"
            name={`${prefix}staff_instructions_dirty`}
            value={staffInstructionsDirty ? "true" : "false"}
          />
          <input
            type="hidden"
            name={`${prefix}terms_dirty`}
            value={termsDirty ? "true" : "false"}
          />
          <input
            type="hidden"
            name={`${prefix}reward_item_dirty`}
            value={rewardItemDirty ? "true" : "false"}
          />
        </>
      ) : null}
      <FormSection
        title="Grundlagen"
        compact
        required="subtle"
      >
        <FieldGrid compact>
          <SelectField
            label="Auslöser oder Kampagne"
            name={`${prefix}deal_concept`}
            value={selectedDealType}
            options={withCurrentOption(
              dealUiTypeOptions,
              deal ? dealUiTypeForDeal(deal) : selectedDealType,
            )}
            onChange={handleDealTypeChange}
            required={useBrowserValidation}
          />
          <SelectField
            label="Belohnungsformat"
            name={`${prefix}discount_type`}
            value={selectedDiscountType}
            options={withCurrentOption(
              config.discountOptions,
              normalizeDiscountTypeForUi(
                selectedBackendDealType,
                deal?.discount_type,
              ),
            )}
            onChange={handleDiscountTypeChange}
            required={useBrowserValidation}
          />
          <SelectField
            label="Zielgruppe"
            name={`${prefix}audience`}
            value={selectedAudience}
            options={audienceOptions}
            onChange={(audience) => {
              setSelectedAudience(audience)
              onDraftMetaChange?.({ audience })
            }}
            required
          />
          <CheckboxField
            label="Aktiv"
            name={`${prefix}active`}
            checked={active}
            onChange={(checked) => {
              setActive(checked)
              onDraftActiveChange?.(checked)
            }}
          />
        </FieldGrid>
        <DealTypeDescription
          explanation={config.explanation}
          typeLabel={selectedDealTypeLabel}
        />
        {dealDropSoldOut ? (
          <WarningNote>
            Dieser Deal Drop ist ausverkauft und kann nicht mehr eingelöst werden.
          </WarningNote>
        ) : null}
        <input
          type="hidden"
          name={`${prefix}benefit_category`}
          value={benefitCategory}
        />
        <input
          type="hidden"
          name={`${prefix}activation_required`}
          value={activationRequired ? "true" : "false"}
        />
      </FormSection>

      <FormSection title="Öffentliche Darstellung" compact>
        <p className="text-xs leading-5 text-zinc-500">
          Diese Texte sehen Nutzer in der App und auf der öffentlichen Partnerseite. Die technischen Deal-Felder bleiben davon getrennt.
        </p>
        <FieldGrid compact>
          <TextField
            label="Anzeigetitel"
            name={`${prefix}display_title`}
            placeholder="z. B. 2 für 1 ausgewählter Artikel"
            value={displayTitle}
            onChange={(value) => {
              setDisplayTitle(value)
              onDraftMetaChange?.({ displayTitle: value })
            }}
            hint="Optional. Leer verwendet den typbasierten Fallback."
          />
          <div className="space-y-2">
            <TextField
              label="Anzeigebeschreibung / Unterzeile"
              name={`${prefix}display_subtitle`}
              placeholder={generatedDisplaySubtitle || "Zwei bekommen, eins bezahlen"}
              value={displaySubtitle}
              maxLength={adminTextLimits.longText}
              onChange={(value) => {
                setDisplaySubtitle(value)
                onDraftMetaChange?.({ displaySubtitle: value })
              }}
              hint={
                displaySubtitleAuto
                  ? "Automatische Unterzeile ist aktiv. Deaktiviere sie, um einen eigenen Text oder keinen Text zu verwenden."
                  : "Leer speichern blendet die Unterzeile aus."
              }
            />
            <CheckboxField
              label="Automatische Unterzeile verwenden"
              name={`${prefix}display_subtitle_auto`}
              checked={displaySubtitleAuto}
              onChange={(checked) => {
                setDisplaySubtitleAuto(checked)
                onDraftMetaChange?.({ displaySubtitleAuto: checked })
              }}
              hint="Bei Aktivierung wird display_subtitle als null gespeichert."
            />
          </div>
        </FieldGrid>
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm text-teal-950">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-700">
            Vorschau
          </p>
          <p className="mt-1 font-semibold">{displayTitle.trim() || generatedDisplayTitle}</p>
          {displaySubtitleAuto ? (
            generatedDisplaySubtitle ? (
              <p className="mt-0.5 text-xs text-teal-800">{generatedDisplaySubtitle}</p>
            ) : null
          ) : displaySubtitle.trim() ? (
            <p className="mt-0.5 text-xs text-teal-800">{displaySubtitle.trim()}</p>
          ) : (
            <p className="mt-0.5 text-xs italic text-teal-700">Keine Unterzeile</p>
          )}
        </div>
      </FormSection>

      {hasRewardDetails ? (
        <FormSection
          title="Belohnungsdetails"
          compact
          required={rewardDetailsRequired ? "subtle" : undefined}
        >
          <FieldGrid compact>
            {config.visibleFields.has("challengeName") ? (
              <TextField
                label="Challenge-Name"
                name={`${prefix}challenge_name`}
                placeholder="3 Besuche diese Woche"
                value={challengeName}
                onChange={(value) => {
                  setChallengeName(value)
                  onDraftTitleChange?.(
                    value.trim() ||
                      formatDealDisplayName({
                        type: selectedDealType,
                        discountType: selectedDiscountType,
                        discountValue: parseOptionalNumberInput(discountValue),
                        rewardItem,
                        benefitCount: parseOptionalNumberInput(benefitCount),
                      }),
                  )
                }}
                hint={dealFieldHelp.challengeName}
                required={
                  useBrowserValidation &&
                  config.requiredFields.has("challengeName")
                }
                warning={validationMessages.challengeName}
              />
            ) : null}
            {config.visibleFields.has("durationConfig") ? (
              <>
                <TextField
                  label="Zeitraum"
                  name={`${prefix}duration_value`}
                  type="number"
                  min={1}
                  value={durationValue}
                  onChange={setDurationValue}
                  hint={dealFieldHelp.durationValue}
                  required={
                    useBrowserValidation &&
                    config.requiredFields.has("durationConfig")
                  }
                  warning={validationMessages.durationValue}
                />
                <SelectField
                  label="Zeiteinheit"
                  name={`${prefix}duration_unit`}
                  value={durationUnit}
                  options={durationUnitOptions}
                  onChange={setDurationUnit}
                  required={
                    useBrowserValidation &&
                    config.requiredFields.has("durationConfig")
                  }
                />
              </>
            ) : null}
            {config.visibleFields.has("discountValue") ? (
              <TextField
                label={config.valueLabels.discountValueLabel}
                name={`${prefix}discount_value`}
                type="number"
                step="any"
                min={0.01}
                max={selectedDiscountType === "percent" ? 100 : undefined}
                placeholder={config.valueLabels.discountValuePlaceholder}
                prefixText={config.valueLabels.discountValuePrefix}
                suffixText={config.valueLabels.discountValueSuffix}
                value={discountValue}
                onChange={(value) => {
                  setDiscountValue(value)
                  emitDraftTitle({ discountValueText: value })
                }}
                hint={config.valueLabels.discountValueHint}
                required={
                  useBrowserValidation &&
                  config.requiredFields.has("discountValue")
                }
                warning={validationMessages.discountValue}
              />
            ) : null}
            {config.visibleFields.has("rewardItem") ? (
              <TextField
                label={selectedDiscountType === "2for1" ? "Artikelname" : "Name des Gratisartikels"}
                name={`${prefix}reward_item`}
                placeholder="z. B. Getränk"
                value={rewardItem}
                onChange={(value) => {
                  setRewardItemDirty(true)
                  setRewardItem(value)
                  emitDraftTitle({ rewardItemText: value })
                }}
                hint={
                  selectedDiscountType === "2for1"
                    ? "Zum Beispiel Burger, Kaffee oder Hauptgericht."
                    : "Zum Beispiel Gratisgetränk."
                }
                required={
                  useBrowserValidation &&
                  config.requiredFields.has("rewardItem")
                }
                warning={validationMessages.rewardItem}
              />
            ) : null}
            {config.visibleFields.has("benefitCount") ? (
              <TextField
                label="Anzahl Bonusstempel"
                name={`${prefix}benefit_count`}
                type="number"
                min={1}
                placeholder="1"
                value={benefitCount}
                onChange={(value) => {
                  setBenefitCount(value)
                  emitDraftTitle({ benefitCountText: value })
                }}
                hint="Zum Beispiel: 1 fügt einen zusätzlichen Stempel hinzu."
                required={
                  useBrowserValidation &&
                  config.requiredFields.has("benefitCount")
                }
                warning={validationMessages.benefitCount}
              />
            ) : null}
            {config.visibleFields.has("estimatedSavings") ? (
              <TextField
                label="Geschätzte Ersparnis (€)"
                name={`${prefix}estimated_savings`}
                type="number"
                step="any"
                min={0}
                value={estimatedSavings}
                onChange={setEstimatedSavings}
                hint="Wird für Ersparnisstatistiken und Animationen verwendet."
                recommended={isLimitedDrop}
              />
            ) : null}
            {config.visibleFields.has("happyHour") ? (
              <>
                <TextField
                  label="Beginn der Happy Hour"
                  name={`${prefix}happy_hour_start`}
                  type="time"
                  value={happyHourStart}
                  onChange={setHappyHourStart}
                  hint="Tägliche Startzeit."
                  required={
                    useBrowserValidation &&
                    config.requiredFields.has("happyHour")
                  }
                  warning={validationMessages.happyHourStart}
                />
                <TextField
                  label="Ende der Happy Hour"
                  name={`${prefix}happy_hour_end`}
                  type="time"
                  value={happyHourEnd}
                  onChange={setHappyHourEnd}
                  hint="Tägliche Endzeit."
                  required={
                    useBrowserValidation &&
                    config.requiredFields.has("happyHour")
                  }
                  warning={validationMessages.happyHourEnd}
                />
                <WeekdayChipField
                  label="Wochentage der Happy Hour"
                  name={`${prefix}valid_weekdays`}
                  defaultValues={deal?.valid_weekdays}
                  hint={dealFieldHelp.happyHourWeekdays}
                />
              </>
            ) : null}
            {config.visibleFields.has("triggerValue") ? (
              <TextField
                label="Auslöserwert"
                name={`${prefix}trigger_value`}
                type="number"
                min={1}
                value={triggerValue}
                onChange={setTriggerValue}
                hint="Zum Beispiel: 3 für einen 3-Tage-Streak."
                required={
                  useBrowserValidation &&
                  config.requiredFields.has("triggerValue")
                }
                warning={validationMessages.triggerValue}
              />
            ) : null}
            {config.visibleFields.has("expiryDays") ? (
              <TextField
                label="Gültigkeitstage"
                name={`${prefix}expiry_days`}
                type="number"
                min={0}
                value={expiryDays}
                onChange={setExpiryDays}
                hint="Optionale Gültigkeit nach dem Erhalt der Belohnung."
              />
            ) : null}
            {config.visibleFields.has("limitedWindow") ? (
              <>
                <TextField
                  label="Gültig ab"
                  name={`${prefix}starts_at`}
                  type="datetime-local"
                  value={startsAt}
                  onChange={setStartsAt}
                  hint={dealFieldHelp.validWindow}
                />
                <TextField
                  label="Gültig bis"
                  name={`${prefix}ends_at`}
                  type="datetime-local"
                  value={endsAt}
                  onChange={setEndsAt}
                  hint={dealFieldHelp.validWindow}
                  warning={validationMessages.endsAt}
                />
              </>
            ) : null}
            {showsAllowFreeTrial ? (
              <CheckboxField
                label="Free-Testeinlösung erlauben"
                name={`${prefix}allow_free_trial`}
                checked={allowFreeTrial}
                onChange={setAllowFreeTrial}
                hint="Free-Nutzer können diesen Vorteil einmal mit ihrer globalen 2-für-1-Testeinlösung nutzen."
              />
            ) : null}
          </FieldGrid>
        </FormSection>
      ) : null}

      {config.visibleFields.has("comebackCandidates") ? (
        <ComebackCandidatesSection
          prefix={prefix}
          visits={visits}
          inactivityValue={inactivityValue}
          inactivityUnit={inactivityUnit}
          minVisitCount={minVisitCount}
          maxVisitCount={maxVisitCount}
          onInactivityValueChange={setInactivityValue}
          onInactivityUnitChange={setInactivityUnit}
          onMinVisitCountChange={setMinVisitCount}
          onMaxVisitCountChange={setMaxVisitCount}
          required={
            useBrowserValidation &&
            config.requiredFields.has("comebackCandidates")
          }
          validationMessages={validationMessages}
        />
      ) : null}

      {isLimitedDrop ? (
        <FormSection title="Deal-Drop-Kontingent" compact required="subtle">
          <FieldGrid compact>
            <TextField
              label="Gesamtkontingent"
              name={`${prefix}stock_total`}
              type="number"
              min={0}
              value={dealDropStockTotal}
              onChange={(value) => {
                setDealDropStockTotal(value)
                if (!stockRemainingEdited) setDealDropStockRemaining(value)
              }}
              required={useBrowserValidation}
            />
            <TextField
              label="Verbleibendes Kontingent"
              name={`${prefix}stock_remaining`}
              type="number"
              min={0}
              value={dealDropStockRemaining}
              onChange={(value) => {
                setDealDropStockRemaining(value)
                setStockRemainingEdited(true)
              }}
              required={useBrowserValidation}
            />
          </FieldGrid>
          {dealDropSoldOut ? (
            <p className="text-xs font-semibold text-amber-700">
              Dieser Deal Drop ist aktuell ausverkauft.
            </p>
          ) : null}
        </FormSection>
      ) : null}

      <FormSection title="Kundentext und Mitarbeiterhinweise" compact>
        <TextAreaField
          label="Kundenbeschreibung"
          name={`${prefix}customer_description`}
          labelAccessory={
            partnerName ? (
              <ContentAgentSuggestionButton
                fieldLabel="Kundenbeschreibung"
                pending={isGeneratingDealCopy}
                onClick={() => requestDealCopy("customer_description")}
              />
            ) : null
          }
          value={customerDescription}
          onChange={(value) => {
            setCustomerDescription(value)
            setCustomerDescriptionDirty(true)
          }}
          showCharacterCount={false}
        />
        <TextAreaField
          label="Mitarbeiterhinweise"
          name={`${prefix}staff_instructions`}
          labelAccessory={
            partnerName ? (
              <ContentAgentSuggestionButton
                fieldLabel="Mitarbeiterhinweise"
                pending={isGeneratingDealCopy}
                onClick={() => requestDealCopy("staff_instructions")}
              />
            ) : null
          }
          value={staffInstructions}
          onChange={(value) => {
            setStaffInstructions(value)
            setStaffInstructionsDirty(true)
          }}
          showCharacterCount={false}
        />
        <TextAreaField
          label="Bedingungen"
          name={`${prefix}terms`}
          labelAccessory={
            partnerName ? (
              <ContentAgentSuggestionButton
                fieldLabel="Bedingungen"
                pending={isGeneratingDealCopy}
                onClick={() => requestDealCopy("terms")}
              />
            ) : null
          }
          value={terms}
          onChange={(value) => {
            setTerms(value)
            setTermsDirty(true)
          }}
          showCharacterCount={false}
        />
        {dealCopyState.message ? (
          <ActionMessage state={dealCopyState} toast={false} />
        ) : null}
      </FormSection>

      {isLimitedDrop ? (
        <FormSection title="Deal-Drop-Kartenbild" compact>
          <p className="text-xs leading-5 text-zinc-500">
            Lade ein Highlight-Bild für die Vorteilskarte hoch (710×400 px).
          </p>
          <MediaUploadField
            key={`deal-drop-image-${deal?.id ?? "new"}`}
            label="Deal-Drop-Kartenbild (710×400)"
            fileName={`${prefix}deal_drop_image_file`}
            existingName={`${prefix}existing_deal_drop_image_url`}
            removeName={`${prefix}remove_deal_drop_image`}
            currentUrl={
              metadataString(metadataObject(deal?.metadata), "card_image_url") || undefined
            }
            spec={partnerMediaSpecs.dealDrop}
          />
        </FormSection>
      ) : null}

      {isLimitedDrop ? (
        <DealDropPreviewCard
          audience={selectedAudience}
          discountType={selectedDiscountType}
          discountValue={parseOptionalNumberInput(discountValue)}
          endsAt={endsAt}
          estimatedSavings={parseOptionalNumberInput(estimatedSavings)}
          expiryDays={parseOptionalNumberInput(expiryDays)}
          rewardItem={rewardItem}
          rewardText={customerDescription}
          soldOut={dealDropSoldOut}
          stockRemaining={parseOptionalNumberInput(dealDropStockRemaining)}
          stockTotal={parseOptionalNumberInput(dealDropStockTotal)}
          trialEligible={allowFreeTrial}
        />
      ) : null}

      <AdvancedSettingsSection>
        <FieldGrid compact>
          {!isLimitedDrop ? (
            <>
              <TextField
                label="Gültig ab"
                name={`${prefix}valid_from`}
                type="datetime-local"
                value={validFrom}
                onChange={setValidFrom}
                hint={dealFieldHelp.validWindow}
              />
              <TextField
                label="Gültig bis"
                name={`${prefix}valid_until`}
                type="datetime-local"
                value={validUntil}
                onChange={setValidUntil}
                hint={dealFieldHelp.validWindow}
              />
            </>
          ) : null}
          {!isWelcomeDeal ? (
            <>
              <TextField
                label="Maximale Einlösungen insgesamt"
                name={`${prefix}max_redemptions_global`}
                type="number"
                min={0}
                defaultValue={deal?.max_redemptions_global}
                hint={dealFieldHelp.maxRedemptionsGlobal}
              />
              <TextField
                label="Maximale Einlösungen pro Nutzer"
                name={`${prefix}max_redemptions_per_user`}
                type="number"
                min={0}
                defaultValue={deal?.max_redemptions_per_user}
                hint={dealFieldHelp.maxRedemptionsPerUser}
              />
              <TextField
                label="Wartezeit in Stunden"
                name={`${prefix}cooldown_hours`}
                type="number"
                min={0}
                defaultValue={deal?.cooldown_hours}
                hint={dealFieldHelp.cooldownHours}
              />
            </>
          ) : null}
          <TextField
            label="Mindestbestellwert"
            name={`${prefix}min_spend`}
            type="number"
            step="any"
            min={0}
            value={minSpend}
            onChange={setMinSpend}
            hint={dealFieldHelp.minSpend}
            warning={validationMessages.minSpend}
          />
          <TextField
            label="Maximaler Rabattbetrag"
            name={`${prefix}max_discount_amount`}
            type="number"
            step="any"
            min={0}
            defaultValue={deal?.max_discount_amount}
            hint={dealFieldHelp.maxDiscountAmount}
          />
          <TextField
            label="Zeitzone"
            name={`${prefix}timezone`}
            defaultValue={deal?.timezone ?? DEFAULT_TIMEZONE}
            hint={dealFieldHelp.timezone}
          />
          {isLimitedDrop ? (
            <WeekdayChipField
              label="Gültige Wochentage"
              name={`${prefix}valid_weekdays`}
              defaultValues={deal?.valid_weekdays}
              hint={dealFieldHelp.weekdays}
            />
          ) : !isHappyHour ? (
            <MultiSelectField
              label="Wochentage"
              name={`${prefix}weekdays`}
              defaultValues={deal?.weekdays}
              options={withCurrentOptions(weekdayOptions, deal?.weekdays)}
              hint={dealFieldHelp.weekdays}
            />
          ) : null}
        </FieldGrid>
      </AdvancedSettingsSection>
    </div>
  )
}

function DealDropPreviewCard({
  audience,
  discountType,
  discountValue,
  endsAt,
  estimatedSavings,
  expiryDays,
  rewardItem,
  rewardText,
  soldOut,
  stockRemaining,
  stockTotal,
  trialEligible,
}: {
  audience: string
  discountType: string
  discountValue: number | null
  endsAt: string
  estimatedSavings: number | null
  expiryDays: number | null
  rewardItem: string
  rewardText: string
  soldOut: boolean
  stockRemaining: number | null
  stockTotal: number | null
  trialEligible: boolean
}) {
  const rewardTitle = formatDealDropRewardTitle(discountType, discountValue, rewardItem)
  const description = rewardText.trim() || formatDealDropRewardText(discountType)
  const stockState = formatDealDropStockState(stockTotal, stockRemaining, soldOut)
  const countdownState = formatCountdownState(endsAt)
  const expiryInfo = formatPreviewExpiryInfo(endsAt, expiryDays)
  const audienceLabel = dealAudienceValueLabel(audience)
  const accessLabel = formatPreviewAccessLabel(audience, trialEligible)

  return (
    <FormSection title="Live-Vorschau" defaultOpen={false} compact>
      <div className="max-w-md rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        {soldOut ? (
          <div className="mb-3">
            <WarningNote>
              Dieser Deal Drop ist ausverkauft und kann nicht mehr eingelöst werden.
            </WarningNote>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Deal Drop</Badge>
          <Badge>{accessLabel ?? audienceLabel}</Badge>
        </div>
        <h4 className="mt-3 text-lg font-semibold tracking-normal text-zinc-950">
          {rewardTitle}
        </h4>
        <p className="mt-1 text-sm leading-6 text-zinc-600">{description}</p>
        <div className="mt-4 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
          <Info label="Kontingent" value={stockState} />
          <Info label="Countdown" value={countdownState} />
          <Info
            label="Geschätzte Ersparnis"
            value={formatSavingsPreview(discountType, estimatedSavings)}
          />
          <Info label="Gültigkeit" value={expiryInfo} />
        </div>
      </div>
    </FormSection>
  )
}

function MilestonesPanel({
  partner,
  embedded = false,
}: {
  partner: PartnerWithDeals
  embedded?: boolean
}) {
  const [milestoneEditor, setMilestoneEditor] = useState<MilestoneEditorState | null>(null)
  const partnerId = partner.id ?? ""
  const milestoneStatus: SectionStatus = partner.reward_milestones.length
    ? {
        label: `${partner.reward_milestones.length} milestone${
          partner.reward_milestones.length === 1 ? "" : "s"
        }`,
      }
    : { label: "Required", tone: "required-subtle" }

  const content = (
    <div className="space-y-3">
      {partner.reward_milestones.length ? (
        <div className="space-y-3">
          {partner.reward_milestones.map((milestone) => (
            <MilestoneCard
              key={milestone.id ?? `${milestone.partner_id}-${milestone.required_stamps}`}
              milestone={milestone}
              onEdit={() => setMilestoneEditor({ mode: "edit", milestone })}
            />
          ))}
        </div>
      ) : (
        <EmptyState>No stamp-card milestones configured yet.</EmptyState>
      )}
      {partnerId ? (
        <button
          type="button"
          onClick={() => setMilestoneEditor({ mode: "create" })}
          className="h-10 rounded-md border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-800 transition hover:bg-teal-50"
        >
          Add milestone
        </button>
      ) : null}
      <MilestoneEditorDialog
        editor={milestoneEditor}
        onClose={() => setMilestoneEditor(null)}
        partner={partner}
      />
    </div>
  )

  if (embedded) {
    return (
      <FormSection
        title="Stamp-card milestones"
        defaultOpen={partner.reward_milestones.length === 0}
        status={milestoneStatus}
      >
        {content}
      </FormSection>
    )
  }

  return (
    <EditorShell
      title="Stamp-card milestones"
      description="Manage stamp-card rewards separately from deals."
      collapsible
      defaultOpen={false}
      status={milestoneStatus}
    >
      {content}
    </EditorShell>
  )
}

function MilestoneCard({
  milestone,
  onEdit,
}: {
  milestone: PartnerRewardMilestone
  onEdit: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button, form, a, input")) onEdit()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onEdit()
        }
      }}
      className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 shadow-xs transition hover:border-teal-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-left">
          <span className="block truncate text-sm font-semibold text-zinc-800">
            {milestone.title || milestone.reward_item || "Milestone reward"}
          </span>
          <span className="mt-1 block text-xs text-zinc-500">
            {formatOptionalNumber(milestone.required_stamps)} stamps -
            {" "}
            {labelForValue(rewardTypeOptions, milestone.reward_type)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {milestone.id ? <DeleteMilestoneForm milestoneId={milestone.id} /> : null}
        </div>
      </div>
    </div>
  )
}

function MilestoneEditorDialog({
  editor,
  onClose,
  partner,
}: {
  editor: MilestoneEditorState | null
  onClose: () => void
  partner: PartnerWithDeals
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editor) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [editor, onClose])

  if (!editor || !partner.id) return null
  const milestone = editor.mode === "edit" ? editor.milestone : undefined

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#061829]/65 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="milestone-dialog-title"
        className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:max-h-[90dvh] sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
          <div>
            <h3 id="milestone-dialog-title" className="text-lg font-bold tracking-tight text-zinc-950">
              {milestone ? "Edit stamp milestone" : "Add stamp milestone"}
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Set the stamp target and the reward customers receive.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {milestone?.id ? (
              <DeleteMilestoneForm milestoneId={milestone.id} onDeleted={onClose} />
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-9 place-items-center rounded-full border border-zinc-300 bg-white text-lg text-zinc-600 hover:bg-zinc-100"
            >
              ×
            </button>
          </div>
        </header>
        <div className="overflow-y-auto p-3 sm:p-4">
          <MilestoneForm
            milestone={milestone}
            partner={partner}
            mode={milestone ? "edit" : "create"}
            onSaved={onClose}
          />
        </div>
      </section>
    </div>
  )
}

function MilestoneForm({
  milestone,
  onSaved,
  partner,
  mode,
}: {
  milestone?: PartnerRewardMilestone
  onSaved?: () => void
  partner: PartnerWithDeals
  mode: "create" | "edit"
}) {
  const [state, formAction] = useActionState(saveRewardMilestone, initialState)
  const formRef = useActionSuccess(state, onSaved)
  const [rewardType, setRewardType] = useState(
    milestone?.reward_type ?? "item",
  )
  const showsRewardItem = rewardType === "item"
  const showsDiscountValue = rewardType === "fixed" || rewardType === "percent"
  const showsBenefitCount = rewardType === "bonus_stamp"
  const requiredSectionsOpen = true

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={milestone?.id ?? ""} />
      <input type="hidden" name="partner_id" value={partner.id ?? ""} />
      <input
        type="hidden"
        name="reward_track_target"
        value={milestone?.reward_track_target ?? DEFAULT_REWARD_TRACK_TARGET}
      />
      <FormSection
        title="Milestone Details"
        defaultOpen={requiredSectionsOpen}
        required
      >
        <FieldGrid>
          <TextField
            label="Required stamps"
            name="required_stamps"
            type="number"
            defaultValue={milestone?.required_stamps}
            min={1}
            max={MAX_STAMP_CARD_STAMPS}
            hint={`Must be between 1 and ${MAX_STAMP_CARD_STAMPS}.`}
            required
          />
          <SelectField
            label="Belohnungstyp"
            name="reward_type"
            value={rewardType}
            options={withCurrentOption(rewardTypeOptions, milestone?.reward_type)}
            onChange={setRewardType}
            required
          />
          <input type="hidden" name="discount_type" value={rewardType} />
          <TextField
            label="Title"
            name="title"
            defaultValue={milestone?.title}
          />
          {showsRewardItem ? (
            <TextField
              label="Artikelname"
              name="reward_item"
              defaultValue={milestone?.reward_item}
              required
            />
          ) : null}
          {showsDiscountValue ? (
            <TextField
              label="Discount value"
              name="discount_value"
              type="number"
              step="any"
              defaultValue={milestone?.discount_value}
              required
            />
          ) : null}
          {showsBenefitCount ? (
            <TextField
              label="Bonus stamp count"
              name="discount_value"
              type="number"
              defaultValue={milestone?.discount_value ?? 1}
            />
          ) : null}
          <TextField
            label="Estimated savings"
            name="estimated_savings"
            type="number"
            step="any"
            defaultValue={milestone?.estimated_savings}
          />
          <SelectField
            label="Audience"
            name="audience"
            defaultValue={milestone?.audience ?? DEFAULT_AUDIENCE}
            options={withCurrentOption(
              milestoneAudienceOptions,
              milestone?.audience,
            )}
            required
          />
        </FieldGrid>
        <CheckboxField
          label="Active"
          name="active"
          defaultChecked={milestone?.active ?? true}
        />
      </FormSection>
      <FormSection
        title="Customer copy and staff instructions"
        defaultOpen={false}
      >
        <InfoNote>
          If customer description, staff instructions, or terms are left blank,
          a generic version will be entered automatically.
        </InfoNote>
        <FieldGrid>
          <TextAreaField
            label="Customer description"
            name="customer_description"
            defaultValue={milestone?.customer_description}
          />
          <TextAreaField
            label="Staff instructions"
            name="staff_instructions"
            defaultValue={milestone?.staff_instructions}
            hint="Scanner/order staff need this to know what to give."
          />
          <TextAreaField
            label="Terms"
            name="terms"
            defaultValue={milestone?.terms}
          />
        </FieldGrid>
      </FormSection>
      <ActionMessage state={state} />
      <SubmitButton
        label={mode === "create" ? "Add milestone" : "Save milestone"}
        pendingLabel={
          mode === "create" ? "Adding milestone..." : "Saving milestone..."
        }
      />
    </form>
  )
}

function PartnerStaffPanel({
  embedded = false,
  partner,
  users,
}: {
  embedded?: boolean
  partner: PartnerWithDeals
  users: OwnerOption[]
}) {
  const [showNewStaff, setShowNewStaff] = useState(partner.staff.length === 0)

  const content = (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-teal-100 text-sm font-bold text-teal-800">
              {partner.staff.length}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-950">
                Authorized staff
              </p>
              <p className="mt-0.5 text-xs leading-5 text-zinc-500">
                Give selected users scanner or administrative access.
              </p>
            </div>
          </div>
          {partner.id && !showNewStaff ? (
            <button
              type="button"
              onClick={() => setShowNewStaff(true)}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-teal-700 px-3.5 text-sm font-semibold text-white transition hover:bg-teal-800"
            >
              <span aria-hidden="true" className="text-base leading-none">+</span>
              Add staff access
            </button>
          ) : null}
        </div>
        {showNewStaff ? (
          <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-3 sm:p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-zinc-950">Add staff access</h4>
                <p className="mt-1 text-xs text-zinc-600">Choose a user and assign the appropriate role.</p>
              </div>
              {partner.staff.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowNewStaff(false)}
                  className="h-8 rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                >
                  Cancel
                </button>
              ) : null}
            </div>
            <PartnerStaffForm
              partner={partner}
              users={users}
              mode="create"
              onSaved={() => setShowNewStaff(false)}
            />
          </div>
        ) : null}
        {partner.staff.length ? (
          <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {partner.staff.map((staff) => (
              <PartnerStaffCard
                key={staff.id ?? `${staff.partner_id}-${staff.user_id}`}
                partner={partner}
                staff={staff}
                users={users}
              />
            ))}
          </div>
        ) : (
          <EmptyState>No scanner or admin access configured yet.</EmptyState>
        )}
      </div>
  )

  if (embedded) {
    return content
  }

  return (
    <EditorShell
      title="Partner staff and scanners"
      description="Authorize partner users as scanners or admins for this partner."
      collapsible
      defaultOpen={false}
    >
      {content}
    </EditorShell>
  )
}

function PartnerStaffCard({
  partner,
  staff,
  users,
}: {
  partner: PartnerWithDeals
  staff: PartnerStaff
  users: OwnerOption[]
}) {
  const [editing, setEditing] = useState(false)
  const staffName =
    staff.user_name || staff.user_email || staff.user_id || "Staff user"

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-100 text-xs font-bold uppercase text-zinc-700">
            {staffName.slice(0, 2)}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-zinc-950">
              {staffName}
            </h3>
            <span className="mt-1 inline-flex rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-semibold text-zinc-600">
              {labelForValue(partnerStaffRoleOptions, staff.role)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100"
          >
            {editing ? "Close" : "Edit access"}
          </button>
          {staff.id ? <DeletePartnerStaffForm staffId={staff.id} /> : null}
        </div>
      </div>
      {editing ? (
        <div className="mt-4 border-t border-zinc-200 bg-zinc-50/70 px-3 pb-3 pt-4 sm:px-4 sm:pb-4">
          <PartnerStaffForm
            partner={partner}
            staff={staff}
            users={users}
            mode="edit"
            onSaved={() => setEditing(false)}
          />
        </div>
      ) : null}
    </div>
  )
}

function PartnerStaffForm({
  onSaved,
  partner,
  staff,
  users,
  mode,
}: {
  onSaved?: () => void
  partner: PartnerWithDeals
  staff?: PartnerStaff
  users: OwnerOption[]
  mode: "create" | "edit"
}) {
  const [state, formAction] = useActionState(savePartnerStaff, initialState)
  const formRef = useActionSuccess(state, onSaved)
  const userOptions = users.map((user) => ({
    value: user.id ?? user.uid ?? "",
    label:
      [user.display_name, user.email].filter(Boolean).join(" - ") ||
      user.id ||
      user.uid ||
      "Unnamed user",
  }))

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={staff?.id ?? ""} />
      <input type="hidden" name="partner_id" value={partner.id ?? ""} />
      <FieldGrid>
        {userOptions.length ? (
          <SelectField
            label="User"
            name="user_id"
            defaultValue={staff?.user_id}
            options={withCurrentOption(userOptions, staff?.user_id)}
            required
          />
        ) : (
          <TextField
            label="User ID"
            name="user_id"
            defaultValue={staff?.user_id}
            required
          />
        )}
        <SelectField
          label="Role"
          name="role"
          defaultValue={staff?.role ?? "scanner"}
          options={withCurrentOption(partnerStaffRoleOptions, staff?.role)}
          required
        />
      </FieldGrid>
      <ActionMessage state={state} />
      <SubmitButton
        label={mode === "create" ? "Add staff access" : "Save staff access"}
        pendingLabel={mode === "create" ? "Adding access..." : "Saving access..."}
      />
    </form>
  )
}

function OpeningHoursPanel({
  partner,
  embedded = false,
  withinPartnerForm = false,
}: {
  partner: PartnerWithDeals
  embedded?: boolean
  withinPartnerForm?: boolean
}) {
  const partnerId = partner.id ?? ""
  const hoursByWeekday = new Map(
    partner.opening_hours.map((hour) => [hour.weekday, hour] as const),
  )

  const content = (
    <div className="space-y-4">
      <InfoNote>
        Toggle closed days, adjust times, then save the weekly schedule once.
      </InfoNote>
      {partnerId ? (
        <WeeklyOpeningHoursForm
          embedded={withinPartnerForm}
          holidays={partner.holidays}
          hoursByWeekday={hoursByWeekday}
          partnerId={partnerId}
        />
      ) : null}
    </div>
  )

  if (embedded) {
    return (
      <FormSection title="Operating hours" required="subtle">
        {content}
      </FormSection>
    )
  }

  return (
    <EditorShell
      title="Operating hours"
      description="Set the full weekly schedule in one pass."
      collapsible
      defaultOpen={false}
    >
      {content}
    </EditorShell>
  )
}

function WeeklyOpeningHoursForm({
  embedded = false,
  holidays,
  hoursByWeekday,
  partnerId,
}: {
  embedded?: boolean
  holidays: PartnerHoliday[]
  hoursByWeekday: Map<number | null, PartnerOpeningHour>
  partnerId: string
}) {
  const [state, formAction] = useActionState(
    saveWeeklyOpeningHours,
    initialState,
  )
  const formRef = useActionSuccess(state)
  const embeddedFieldsRef = useRef<HTMLDivElement>(null)

  const saveEmbeddedHours = () => {
    const container = embeddedFieldsRef.current

    if (!container) {
      return
    }

    const formData = new FormData()
    formData.set("partner_id", partnerId)

    container
      .querySelectorAll<HTMLInputElement>("[data-opening-hours-name]")
      .forEach((input) => {
        const name = input.dataset.openingHoursName

        if (
          !name ||
          input.disabled ||
          ((input.type === "checkbox" || input.type === "radio") &&
            !input.checked)
        ) {
          return
        }

        formData.append(name, input.value)
      })

    formAction(formData)
  }

  const fields = (
    <WeeklyHoursFields
      embedded={embedded}
      holidays={holidays}
      hoursByWeekday={hoursByWeekday}
    />
  )

  if (embedded) {
    return (
      <div ref={embeddedFieldsRef} className="space-y-4">
        {fields}
        <ActionMessage state={state} />
        <button
          type="button"
          onClick={saveEmbeddedHours}
          className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800"
        >
          Save operating hours
        </button>
      </div>
    )
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="partner_id" value={partnerId} />
      {fields}
      <ActionMessage state={state} />
      <SubmitButton
        label="Save operating hours"
        pendingLabel="Saving operating hours..."
      />
    </form>
  )
}

function WeeklyHoursFields({
  embedded = false,
  holidays = [],
  hoursByWeekday = new Map(),
}: {
  embedded?: boolean
  holidays?: PartnerHoliday[]
  hoursByWeekday?: Map<number | null, PartnerOpeningHour>
}) {
  const fieldName = (name: string) => (embedded ? undefined : name)
  const fieldDataName = (name: string) =>
    embedded ? { "data-opening-hours-name": name } : {}
  const [bulkOpenTime, setBulkOpenTime] = useState("09:00")
  const [bulkCloseTime, setBulkCloseTime] = useState("18:00")
  const [bulkApplied, setBulkApplied] = useState(false)
  const [holidayEditor, setHolidayEditor] = useState<HolidayEditorState | null>(null)
  const [holidayRows, setHolidayRows] = useState<HolidayDraft[]>(() =>
    holidays
      .map((holiday) => ({
        date: normalizeHolidayDateInput(holiday.holiday_date),
        id: crypto.randomUUID(),
        label: holiday.label ?? "",
        kind: holiday.is_closed === false ? "hours" as const : "closed" as const,
        opensAt: formatTimeInput(holiday.opens_at),
        closesAt: formatTimeInput(holiday.closes_at),
        repeatsYearly: holiday.repeats_yearly ?? false,
      }))
      .filter((holiday) => holiday.date)
      .sort((first, second) => first.date.localeCompare(second.date)),
  )
  const [weeklyHours, setWeeklyHours] = useState(() =>
    Object.fromEntries(
      openingWeekdayOptions.map((day) => {
        const hour = hoursByWeekday.get(Number(day.value))
        const isClosed = hour?.is_closed ?? false

        return [
          day.value,
          {
            closesAt: isClosed
              ? ""
              : formatTimeInput(hour?.closes_at) || "18:00",
            isClosed,
            label: hour?.label ?? "",
            opensAt: isClosed
              ? ""
              : formatTimeInput(hour?.opens_at) || "09:00",
          },
        ]
      }),
    ),
  )
  const updateWeeklyHour = (
    weekday: string,
    update: Partial<(typeof weeklyHours)[string]>,
  ) => {
    setWeeklyHours((current) => ({
      ...current,
      [weekday]: {
        ...current[weekday],
        ...update,
      },
    }))
  }
  const applyBulkTime = () => {
    setWeeklyHours((current) =>
      Object.fromEntries(
        Object.entries(current).map(([weekday, hour]) => [
          weekday,
          hour.isClosed
            ? hour
            : {
                ...hour,
                closesAt: bulkCloseTime,
                opensAt: bulkOpenTime,
              },
        ]),
      ),
    )
    setBulkApplied(true)
  }
  const saveHolidayDraft = (holiday: HolidayDraft) => {
    setHolidayRows((current) =>
      [...current.filter((row) => row.id !== holiday.id), holiday].sort(
        (first, second) => first.date.localeCompare(second.date),
      ),
    )
    setHolidayEditor(null)
  }

  useEffect(() => {
    if (!bulkApplied) {
      return
    }

    const timeout = window.setTimeout(() => setBulkApplied(false), 1400)

    return () => window.clearTimeout(timeout)
  }, [bulkApplied])

  return (
    <div className="flex flex-col gap-4">
      <div className="order-1 rounded-md border border-zinc-200 bg-zinc-50 p-3">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-zinc-700">Open</span>
            <input
              type="time"
              value={bulkOpenTime}
              onChange={(event) => setBulkOpenTime(event.target.value)}
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-zinc-700">Close</span>
            <input
              type="time"
              value={bulkCloseTime}
              onChange={(event) => setBulkCloseTime(event.target.value)}
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <button
            type="button"
            onClick={applyBulkTime}
            className={`self-end rounded-md px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] ${
              bulkApplied
                ? "bg-emerald-700 ring-2 ring-emerald-100"
                : "bg-teal-700 hover:bg-teal-800"
            }`}
            aria-live="polite"
          >
            {bulkApplied ? "Applied" : "Apply to all open days"}
          </button>
        </div>
      </div>
      <section className="order-3 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">Holiday and date-specific hours</h4>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Closures and replacement hours that override the weekly schedule.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setHolidayEditor({ mode: "create" })}
            className="h-9 shrink-0 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800"
          >
            + Add exception
          </button>
        </div>
        <div className="p-3 sm:p-4">
          <input
            type="hidden"
            name={fieldName("holiday_count")}
            value={holidayRows.length}
            {...fieldDataName("holiday_count")}
          />
          {holidayRows.map((holiday, index) => (
            <div key={`holiday-fields-${holiday.id}`}>
              <input
                type="hidden"
                name={fieldName(`holiday_${index}_date`)}
                value={holiday.date}
                {...fieldDataName(`holiday_${index}_date`)}
              />
              <input
                type="hidden"
                name={fieldName(`holiday_${index}_label`)}
                value={holiday.label}
                {...fieldDataName(`holiday_${index}_label`)}
              />
              <input
                type="hidden"
                name={fieldName(`holiday_${index}_kind`)}
                value={holiday.kind}
                {...fieldDataName(`holiday_${index}_kind`)}
              />
              <input
                type="hidden"
                name={fieldName(`holiday_${index}_opens_at`)}
                value={holiday.opensAt}
                {...fieldDataName(`holiday_${index}_opens_at`)}
              />
              <input
                type="hidden"
                name={fieldName(`holiday_${index}_closes_at`)}
                value={holiday.closesAt}
                {...fieldDataName(`holiday_${index}_closes_at`)}
              />
              {holiday.repeatsYearly ? (
                <input
                  type="hidden"
                  name={fieldName(`holiday_${index}_repeats_yearly`)}
                  value="on"
                  {...fieldDataName(`holiday_${index}_repeats_yearly`)}
                />
              ) : null}
            </div>
          ))}
          {holidayRows.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {holidayRows.map((holiday) => (
              <div
                key={holiday.id}
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  if (!(event.target as HTMLElement).closest("button")) {
                    setHolidayEditor({ mode: "edit", holiday })
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    setHolidayEditor({ mode: "edit", holiday })
                  }
                }}
                className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 transition hover:border-teal-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-900">
                      {holiday.label || formatHolidayDateLabel(holiday.date)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {formatHolidayDateLabel(holiday.date)} · {holiday.kind === "hours" ? `${holiday.opensAt}–${holiday.closesAt}` : "Closed all day"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                        {holiday.repeatsYearly ? "Repeats yearly" : "One time"}
                      </span>
                    </div>
                  </div>
                    <button
                      type="button"
                      onClick={() =>
                        setHolidayRows((current) =>
                          current.filter((row) => row.id !== holiday.id),
                        )
                      }
                      aria-label={`Remove ${holiday.label || formatHolidayDateLabel(holiday.date)}`}
                      className="h-8 shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-semibold text-zinc-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                    >
                      Remove
                    </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-5 text-center text-sm text-zinc-500">
            No exceptions yet. Your weekly schedule applies every day.
          </div>
        )}
        {holidayEditor ? (
          <HolidayEditorDialog
            editor={holidayEditor}
            existingHolidays={holidayRows}
            onClose={() => setHolidayEditor(null)}
            onSave={saveHolidayDraft}
          />
        ) : null}
        </div>
      </section>
      <div className="order-2 overflow-x-auto rounded-md border border-zinc-200 bg-white">
        <div className="min-w-[34rem] divide-y divide-zinc-100">
          <div className="grid grid-cols-[8rem_7rem_1fr_1fr] items-center gap-3 bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
            <span>Day</span>
            <span>Status</span>
            <span>Opens</span>
            <span>Closes</span>
          </div>
          {openingWeekdayOptions.map((day) => {
            const hour = weeklyHours[day.value]

            return (
              <div
                key={day.value}
                className="grid grid-cols-[8rem_7rem_1fr_1fr] items-center gap-3 px-3 py-3 text-sm"
              >
                <p className="font-semibold text-zinc-900">{day.label}</p>
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    name={fieldName(`is_closed_${day.value}`)}
                    {...fieldDataName(`is_closed_${day.value}`)}
                    checked={hour.isClosed}
                    onChange={(event) => {
                      const isClosed = event.target.checked

                      updateWeeklyHour(day.value, {
                        closesAt: isClosed ? "" : hour.closesAt,
                        isClosed,
                        opensAt: isClosed ? "" : hour.opensAt,
                      })
                    }}
                    className="size-4 rounded border-zinc-300 accent-teal-700"
                  />
                  Closed
                </label>
                <input
                  aria-label={`${day.label} opening time`}
                  name={fieldName(`opens_at_${day.value}`)}
                  {...fieldDataName(`opens_at_${day.value}`)}
                  type="time"
                  required={!hour.isClosed}
                  value={hour.isClosed ? "" : hour.opensAt}
                  disabled={hour.isClosed}
                  onChange={(event) =>
                    updateWeeklyHour(day.value, { opensAt: event.target.value })
                  }
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />
                <input
                  aria-label={`${day.label} closing time`}
                  name={fieldName(`closes_at_${day.value}`)}
                  {...fieldDataName(`closes_at_${day.value}`)}
                  type="time"
                  required={!hour.isClosed}
                  value={hour.isClosed ? "" : hour.closesAt}
                  disabled={hour.isClosed}
                  onChange={(event) =>
                    updateWeeklyHour(day.value, { closesAt: event.target.value })
                  }
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />
                <input
                  type="hidden"
                  name={fieldName(`label_${day.value}`)}
                  value={hour.label}
                  {...fieldDataName(`label_${day.value}`)}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function HolidayEditorDialog({
  editor,
  existingHolidays,
  onClose,
  onSave,
}: {
  editor: HolidayEditorState
  existingHolidays: HolidayDraft[]
  onClose: () => void
  onSave: (holiday: HolidayDraft) => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const initialHoliday = editor.mode === "edit"
    ? editor.holiday
    : {
        id: crypto.randomUUID(),
        date: "",
        label: "",
        kind: "closed" as const,
        opensAt: "09:00",
        closesAt: "18:00",
        repeatsYearly: false,
      }
  const [draft, setDraft] = useState<HolidayDraft>(initialHoliday)
  const [error, setError] = useState("")

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [onClose])

  const updateDraft = (update: Partial<HolidayDraft>) => {
    setDraft((current) => ({ ...current, ...update }))
    if (error) setError("")
  }
  const applyHoliday = () => {
    const normalizedDate = normalizeHolidayDateInput(draft.date)

    if (!normalizedDate) {
      setError("Choose a valid date.")
      return
    }

    if (
      existingHolidays.some(
        (holiday) => holiday.id !== draft.id && holiday.date === normalizedDate,
      )
    ) {
      setError("That date already has an exception.")
      return
    }

    if (
      draft.kind === "hours" &&
      (!draft.opensAt || !draft.closesAt || draft.opensAt === draft.closesAt)
    ) {
      setError("Choose different opening and closing times.")
      return
    }

    onSave({
      ...draft,
      date: normalizedDate,
      label: draft.label.trim(),
      opensAt: draft.kind === "hours" ? draft.opensAt : "",
      closesAt: draft.kind === "hours" ? draft.closesAt : "",
    })
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#061829]/65 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="holiday-dialog-title"
        className="flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:max-h-[88dvh] sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
          <div>
            <h3 id="holiday-dialog-title" className="text-lg font-bold tracking-tight text-zinc-950">
              {editor.mode === "edit" ? "Edit hours exception" : "Add hours exception"}
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Override the weekly schedule for one date or every year.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full border border-zinc-300 bg-white text-lg text-zinc-600 hover:bg-zinc-100"
          >
            ×
          </button>
        </header>
        <div className="space-y-4 overflow-y-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <FieldLabel label="Date" required />
              <input
                type="date"
                value={draft.date}
                onChange={(event) => updateDraft({ date: event.target.value })}
                className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <SelectField
              label="Change type"
              name="holiday_editor_kind"
              value={draft.kind}
              options={[
                { value: "closed", label: "Closed all day" },
                { value: "hours", label: "Different opening hours" },
              ]}
              onChange={(value) => updateDraft({ kind: value === "hours" ? "hours" : "closed" })}
              required
            />
          </div>
          {draft.kind === "hours" ? (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <TextField
                label="Open"
                name="holiday_editor_opens"
                type="time"
                value={draft.opensAt}
                onChange={(opensAt) => updateDraft({ opensAt })}
                required
                showCharacterCount={false}
              />
              <TextField
                label="Close"
                name="holiday_editor_closes"
                type="time"
                value={draft.closesAt}
                onChange={(closesAt) => updateDraft({ closesAt })}
                required
                showCharacterCount={false}
              />
            </div>
          ) : (
            <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-800">
              The partner will be shown as closed for the full day.
            </div>
          )}
          <TextField
            label="Label"
            name="holiday_editor_label"
            value={draft.label}
            onChange={(label) => updateDraft({ label })}
            placeholder="Christmas Day, private event…"
            hint="Optional note shown with this exception."
            showCharacterCount={false}
          />
          <CheckboxField
            label="Repeat every year"
            name="holiday_editor_repeats"
            checked={draft.repeatsYearly}
            onChange={(repeatsYearly) => updateDraft({ repeatsYearly })}
            hint="Use the same month and day every year."
          />
          {error ? (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4">
            <p className="text-xs text-zinc-500">Save operating hours afterward to publish this change.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyHoliday}
                className="h-9 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
              >
                {editor.mode === "edit" ? "Apply changes" : "Add exception"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function MenuPanel({
  partner,
  embedded = false,
}: {
  partner: PartnerWithDeals
  embedded?: boolean
}) {
  if (!partnerTypeSupportsMenu(partner.type)) {
    return null
  }

  const partnerId = partner.id ?? ""
  const menu = partner.menus[0]

  const content = (
    <div className="space-y-4">
      {partner.menus.length > 1 ? (
        <InfoNote>
          This admin now supports one menu per partner. It is showing the
          first menu loaded for this partner.
        </InfoNote>
      ) : null}
      {!menu && partnerId ? (
        <DealFormShell title="Add menu">
          <MenuForm partnerId={partnerId} />
        </DealFormShell>
      ) : null}
      {menu ? (
        <MenuCard
          key={menu.id ?? `${menu.partner_id}-${menu.name}`}
          menu={menu}
          partnerId={partnerId}
        />
      ) : (
        <EmptyState>No menu configured yet.</EmptyState>
      )}
    </div>
  )

  if (embedded) {
    return content
  }

  return (
    <EditorShell
      title="Menu"
      description="Each partner has one menu with sections and items."
      collapsible
      defaultOpen={false}
    >
      {content}
    </EditorShell>
  )
}

function MenuCard({
  menu,
  partnerId,
}: {
  menu: PartnerMenu
  partnerId: string
}) {
  const [categoryEditor, setCategoryEditor] = useState<MenuCategoryEditorState | null>(null)
  const [itemEditor, setItemEditor] = useState<MenuItemEditorState | null>(null)
  const [selectedItemCategoryId, setSelectedItemCategoryId] = useState(
    menu.categories[0]?.id ?? "__uncategorized",
  )
  const [categoryOrderIds, setCategoryOrderIds] = useState<string[]>([])
  const [itemOrderIds, setItemOrderIds] = useState<string[]>([])
  const [draggedCategoryId, setDraggedCategoryId] = useState("")
  const [draggedItemId, setDraggedItemId] = useState("")
  const [localCategories, setLocalCategories] = useState(menu.categories)
  const [localItems, setLocalItems] = useState(menu.items)
  const [uploadingCategoryImageIds, setUploadingCategoryImageIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [uploadingItemImageIds, setUploadingItemImageIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [previousMenu, setPreviousMenu] = useState(menu)
  const [reorderMessage, setReorderMessage] = useState("")
  const [isReordering, startReorderTransition] = useTransition()
  const categoryCards = applyLocalSortOrder(
    sortMenuCategories(localCategories),
    categoryOrderIds,
  )
  const itemCards = applyLocalSortOrder(sortMenuItems(localItems), itemOrderIds)

  if (menu !== previousMenu) {
    setPreviousMenu(menu)
    setLocalCategories(menu.categories)
    setLocalItems(menu.items)
  }

  const applySavedCategory = useCallback((state: PartnerActionState) => {
    const savedCategory = state.menuCategory
    if (!savedCategory) return

    setLocalCategories((current) => {
      const existing = current.find((category) => category.id === savedCategory.id)
      const nextCategory: MenuCategory = {
        ...savedCategory,
        items: existing?.items ?? [],
      }

      return existing
        ? current.map((category) =>
            category.id === savedCategory.id ? nextCategory : category,
          )
        : [...current, nextCategory]
    })
  }, [])
  const handleCategorySaved = useCallback((state: PartnerActionState, imageFile?: File | null) => {
    applySavedCategory(state)
    setCategoryOrderIds([])
    setCategoryEditor(null)

    const categoryId = state.menuCategory?.id
    if (!imageFile || !categoryId || !menu.id) return

    setUploadingCategoryImageIds((current) => new Set(current).add(categoryId))
    const imageFormData = new FormData()
    imageFormData.set("id", categoryId)
    imageFormData.set("menu_id", menu.id)
    imageFormData.set("image_file", imageFile)
    void saveMenuCategoryImage(initialState, imageFormData)
      .then((imageResult) => {
        dispatchActionToast(imageResult)
        if (imageResult.ok) applySavedCategory(imageResult)
      }, () => dispatchActionToast({
        ok: false,
        message: "Unable to upload the menu category image.",
      }))
      .finally(() => setUploadingCategoryImageIds((current) => {
        const next = new Set(current)
        next.delete(categoryId)
        return next
      }))
  }, [applySavedCategory, menu.id])

  const handleCategoryDeleted = useCallback((state: PartnerActionState) => {
    if (!state.deletedId) return

    setLocalCategories((current) =>
      current.filter((category) => category.id !== state.deletedId),
    )
    setLocalItems((current) =>
      current.filter((item) => item.category_id !== state.deletedId),
    )
    setCategoryOrderIds([])
    setCategoryEditor(null)
  }, [])

  const handleItemDeleted = useCallback((state: PartnerActionState) => {
    if (!state.deletedId) return

    setLocalItems((current) =>
      current.filter((item) => item.id !== state.deletedId),
    )
    setLocalCategories((current) =>
      current.map((category) => ({
        ...category,
        items: category.items.filter((item) => item.id !== state.deletedId),
      })),
    )
    setItemOrderIds([])
    setItemEditor(null)
  }, [])
  const applySavedItem = useCallback((state: PartnerActionState) => {
    const savedItem = state.menuItem
    if (!savedItem) return

    setLocalItems((current) => {
      const existing = current.some((item) => item.id === savedItem.id)
      return existing
        ? current.map((item) => item.id === savedItem.id ? savedItem : item)
        : [...current, savedItem]
    })
    setLocalCategories((current) =>
      current.map((category) => ({
        ...category,
        items: category.id === savedItem.category_id
          ? category.items.some((item) => item.id === savedItem.id)
            ? category.items.map((item) => item.id === savedItem.id ? savedItem : item)
            : [...category.items, savedItem]
          : category.items.filter((item) => item.id !== savedItem.id),
      })),
    )
  }, [])
  const handleItemSaved = useCallback((state: PartnerActionState, imageFile?: File | null) => {
    applySavedItem(state)
    setItemOrderIds([])
    setItemEditor(null)

    const itemId = state.menuItem?.id
    if (!imageFile || !itemId || !menu.id) return

    setUploadingItemImageIds((current) => new Set(current).add(itemId))
    const imageFormData = new FormData()
    imageFormData.set("id", itemId)
    imageFormData.set("menu_id", menu.id)
    imageFormData.set("image_file", imageFile)
    void saveMenuItemImage(initialState, imageFormData)
      .then((imageResult) => {
        dispatchActionToast(imageResult)
        if (imageResult.ok) applySavedItem(imageResult)
      }, () => dispatchActionToast({
        ok: false,
        message: "Unable to upload the menu item image.",
      }))
      .finally(() => setUploadingItemImageIds((current) => {
        const next = new Set(current)
        next.delete(itemId)
        return next
      }))
  }, [applySavedItem, menu.id])
  const handleAddonsUpdated = useCallback(
    (updates: NonNullable<PartnerActionState["updatedAddons"]>) => {
      const addonsByItemId = new Map(
        updates.map(({ itemId, addons }) => [itemId, addons]),
      )
      const applyAddons = (item: MenuItem): MenuItem => {
        if (!item.id) return item
        const addons = addonsByItemId.get(item.id)
        return addons ? { ...item, addons } : item
      }

      setLocalItems((current) => current.map(applyAddons))
      setLocalCategories((current) =>
        current.map((category) => ({
          ...category,
          items: category.items.map(applyAddons),
        })),
      )
    },
    [],
  )
  const nextCategorySortOrder = nextAvailablePosition(
    categoryCards.map((category) => category.sort_order),
  )
  const nextItemSortOrder = nextAvailablePosition(
    itemCards
      .filter((item) => !item.category_id)
      .map((item) => item.sort_order),
  )
  const categoryOptions = categoryCards.map((category) => ({
    value: category.id ?? "",
    label: category.name || category.id || "Unnamed category",
  }))
  const uncategorizedItemCount = itemCards.filter((item) => !item.category_id).length
  const itemCategoryTabs = [
    ...categoryCards
      .filter((category): category is MenuCategory & { id: string } => Boolean(category.id))
      .map((category) => ({
        value: category.id,
        label: category.name || "Untitled category",
        count: itemCards.filter((item) => item.category_id === category.id).length,
      })),
    ...(uncategorizedItemCount || categoryCards.length === 0
      ? [{ value: "__uncategorized", label: "Other", count: uncategorizedItemCount }]
      : []),
  ]
  const activeItemCategoryId = itemCategoryTabs.some(
    (tab) => tab.value === selectedItemCategoryId,
  )
    ? selectedItemCategoryId
    : itemCategoryTabs[0]?.value ?? "__uncategorized"
  const visibleItemCards = itemCards.filter((item) =>
    activeItemCategoryId === "__uncategorized"
      ? !item.category_id
      : item.category_id === activeItemCategoryId,
  )

  const persistCategoryOrder = (targetId: string) => {
    if (!menu.id || !draggedCategoryId || draggedCategoryId === targetId) {
      setDraggedCategoryId("")
      return
    }

    const previousOrderIds = categoryOrderIds
    const orderedIds = moveIdBeforeTarget(
      categoryCards
        .map((category) => category.id)
        .filter((id): id is string => Boolean(id)),
      draggedCategoryId,
      targetId,
    )

    setCategoryOrderIds(orderedIds)
    setDraggedCategoryId("")
    setReorderMessage("")
    startReorderTransition(async () => {
      const result = await reorderMenuCategories(menu.id ?? "", orderedIds)

      setReorderMessage(result.message)
      if (!result.ok) {
        setCategoryOrderIds(previousOrderIds)
      }
    })
  }

  const persistItemOrder = (targetId: string) => {
    if (!menu.id || !draggedItemId || draggedItemId === targetId) {
      setDraggedItemId("")
      return
    }

    const previousOrderIds = itemOrderIds
    const orderedIds = moveIdBeforeTarget(
      itemCards.map((item) => item.id).filter((id): id is string => Boolean(id)),
      draggedItemId,
      targetId,
    )

    setItemOrderIds(orderedIds)
    setDraggedItemId("")
    setReorderMessage("")
    startReorderTransition(async () => {
      const result = await reorderMenuItems(menu.id ?? "", orderedIds)

      setReorderMessage(result.message)
      if (!result.ok) {
        setItemOrderIds(previousOrderIds)
      }
    })
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4">
        <div>
          <h3 className="text-base font-semibold text-zinc-950">Menu details</h3>
          <p className="mt-1 text-sm text-zinc-600">Update the menu name, description, or status here.</p>
        </div>
        <div className="mt-4">
          <MenuForm menu={menu} partnerId={partnerId} />
        </div>
      </section>
      <div className="mt-4 flex flex-wrap gap-2 text-sm text-zinc-600">
        <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 py-2">
          <span className="font-medium text-zinc-800">Categories:</span>
          <span>{localCategories.length}</span>
        </span>
        {uploadingCategoryImageIds.size + uploadingItemImageIds.size > 0 ? (
          <span role="status" className="inline-flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 font-semibold text-sky-800">
            <LoadingSpinner className="size-3.5" />
            Uploading {uploadingCategoryImageIds.size + uploadingItemImageIds.size} image{uploadingCategoryImageIds.size + uploadingItemImageIds.size === 1 ? "" : "s"} in the background…
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 py-2">
          <span className="font-medium text-zinc-800">Items:</span>
          <span>{localItems.length}</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 py-2">
          <span className="font-medium text-zinc-800">Updated:</span>
          <span>{formatDateTime(menu.updated_at)}</span>
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {menu.id ? (
          <MenuImportDialog
            categoryCount={localCategories.length}
            itemCount={localItems.length}
            menuId={menu.id}
            onAddonsUpdated={handleAddonsUpdated}
          />
        ) : null}
        {menu.id ? <DeleteMenuForm menuId={menu.id} /> : null}
      </div>
      {reorderMessage ? (
        <p
          className={`mt-4 rounded-md border px-3 py-2 text-sm ${
            reorderMessage.includes("Unable") || reorderMessage.includes("required")
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {reorderMessage}
        </p>
      ) : null}
      {isReordering ? (
        <p role="status" className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-zinc-500">
          <LoadingSpinner className="size-3" />
          Saving order...
        </p>
      ) : null}

      <div className="mt-5 space-y-3 border-t border-zinc-200 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-zinc-900">Categories</h4>
          <button
            type="button"
            onClick={() => setCategoryEditor({ mode: "create" })}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#061829] px-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#102c43]"
          >
            <span aria-hidden="true">+</span> Add category
          </button>
        </div>
        {categoryCards.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {categoryCards.map((category) => (
              <div
                key={category.id ?? `${category.menu_id}-${category.name}`}
                draggable={Boolean(category.id)}
                onDragStart={() => setDraggedCategoryId(category.id ?? "")}
                onDragEnd={() => setDraggedCategoryId("")}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => category.id && persistCategoryOrder(category.id)}
                className={`transition ${
                  draggedCategoryId === category.id ? "opacity-60" : ""
                }`}
              >
                <MenuCategoryCard
                  category={category}
                  imageUploading={Boolean(category.id && uploadingCategoryImageIds.has(category.id))}
                  onDelete={handleCategoryDeleted}
                  onDuplicate={() => window.location.reload()}
                  onEdit={() => setCategoryEditor({ mode: "edit", category })}
                />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>No menu categories configured yet.</EmptyState>
        )}
      </div>

      <div className="mt-5 space-y-3 border-t border-zinc-200 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-zinc-900">Items</h4>
          <button
            type="button"
            onClick={() => setItemEditor({ mode: "create" })}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#061829] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#102c43] active:scale-[.98]"
          >
            <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-white/12 text-base leading-none">+</span>
            New item
          </button>
        </div>
        {itemCategoryTabs.length ? (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Menu item categories">
            {itemCategoryTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={activeItemCategoryId === tab.value}
                onClick={() => setSelectedItemCategoryId(tab.value)}
                className={`inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-xs font-semibold transition ${
                  activeItemCategoryId === tab.value
                    ? "border-[#061829] bg-[#061829] text-white shadow-sm"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950"
                }`}
              >
                {tab.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  activeItemCategoryId === tab.value ? "bg-white/15" : "bg-zinc-100"
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {visibleItemCards.length ? (
          <div className="max-h-[46rem] overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50/60 p-2 sm:p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {visibleItemCards.map((item) => (
                <div
                  key={item.id ?? `${item.menu_id}-${item.name}`}
                  draggable={Boolean(item.id)}
                  onDragStart={() => setDraggedItemId(item.id ?? "")}
                  onDragEnd={() => setDraggedItemId("")}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => item.id && persistItemOrder(item.id)}
                  className={`transition ${
                    draggedItemId === item.id ? "opacity-60" : ""
                  }`}
                >
                  <MenuItemCard
                    item={item}
                    imageUploading={Boolean(item.id && uploadingItemImageIds.has(item.id))}
                    onDelete={handleItemDeleted}
                    onDuplicate={() => setItemEditor({ mode: "duplicate", item })}
                    onEdit={() => setItemEditor({ mode: "edit", item })}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState>No items in this category yet.</EmptyState>
        )}
      </div>
      <MenuCategoryEditorDialog
        defaultSortOrder={nextCategorySortOrder}
        editor={categoryEditor}
        menuId={menu.id ?? ""}
        onClose={() => setCategoryEditor(null)}
        onDeleted={handleCategoryDeleted}
        onSaved={handleCategorySaved}
      />
      <MenuItemEditorDialog
        categoryOptions={categoryOptions}
        defaultCategoryId={
          activeItemCategoryId === "__uncategorized" ? "" : activeItemCategoryId
        }
        defaultSortOrder={
          itemEditor?.mode === "duplicate"
            ? nextAvailablePosition(
                itemCards
                  .filter(
                    (item) =>
                      item.category_id === itemEditor.item.category_id,
                  )
                  .map((item) => item.sort_order),
              )
            : nextItemSortOrder
        }
        editor={itemEditor}
        menuId={menu.id ?? ""}
        onClose={() => setItemEditor(null)}
        onDeleted={handleItemDeleted}
        onSaved={handleItemSaved}
      />
    </div>
  )
}

function MenuForm({
  menu,
  onSaved,
  partnerId,
}: {
  menu?: PartnerMenu
  onSaved?: () => void
  partnerId: string
}) {
  const normalizedMenuStatus =
    menu?.status === "review" ? DEFAULT_MENU_STATUS : menu?.status ?? DEFAULT_MENU_STATUS
  const [status, setStatus] = useState(normalizedMenuStatus)
  const initialMenuValues = {
    name: (menu?.name ?? "Speisekarte").trim(),
    description: (menu?.description ?? "").trim(),
    status: normalizedMenuStatus,
  }
  const savedMenuValuesRef = useRef(initialMenuValues)
  const submittedMenuValuesRef = useRef(initialMenuValues)
  const [hasMenuChanges, setHasMenuChanges] = useState(false)
  const nextMenuFileInputId = useRef(1)
  const selectedMenuFilesRef = useRef<File[]>([])
  const [menuFileSelections, setMenuFileSelections] = useState<
    Array<{ id: number; files: File[] }>
  >([{ id: 0, files: [] }])
  const saveMenuWithSelectedFiles = useCallback(
    async (previousState: PartnerActionState, formData: FormData) => {
      formData.delete("menu_file")
      selectedMenuFilesRef.current.forEach((file) =>
        formData.append("menu_file", file),
      )
      formData.set(
        "expected_menu_file_count",
        String(selectedMenuFilesRef.current.length),
      )
      return saveMenu(previousState, formData)
    },
    [],
  )
  const [state, formAction] = useActionState(
    saveMenuWithSelectedFiles,
    initialState,
  )
  const formRef = useActionSuccess(state, () => {
    savedMenuValuesRef.current = submittedMenuValuesRef.current
    setHasMenuChanges(false)
    onSaved?.()
  })
  const selectedMenuFiles = menuFileSelections.flatMap(
    (selection) => selection.files,
  )
  const activeMenuFileInput = menuFileSelections.at(-1)

  function retainNewMenuFileSelection(
    inputId: number,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const files = Array.from(event.currentTarget.files ?? [])
    if (!files.length) return

    setMenuFileSelections((current) => {
      const nextSelections = [
        ...current.map((selection) =>
        selection.id === inputId ? { ...selection, files } : selection,
        ),
        { id: nextMenuFileInputId.current++, files: [] },
      ]
      selectedMenuFilesRef.current = nextSelections.flatMap(
        (selection) => selection.files,
      )
      return nextSelections
    })
  }

  function clearNewMenuFiles() {
    selectedMenuFilesRef.current = []
    setMenuFileSelections([
      { id: nextMenuFileInputId.current++, files: [] },
    ])
  }

  function currentMenuValues(form: HTMLFormElement) {
    const values = new FormData(form)
    return {
      name: String(values.get("name") ?? "").trim(),
      description: String(values.get("description") ?? "").trim(),
      status: String(values.get("status") ?? ""),
    }
  }

  function updateMenuDirtyState(form: HTMLFormElement) {
    const current = currentMenuValues(form)
    const saved = savedMenuValuesRef.current
    setHasMenuChanges(
      current.name !== saved.name ||
      current.description !== saved.description ||
      current.status !== saved.status,
    )
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4"
      onChange={(event) => updateMenuDirtyState(event.currentTarget)}
      onSubmitCapture={(event) => {
        submittedMenuValuesRef.current = currentMenuValues(event.currentTarget)
      }}
    >
      <input type="hidden" name="id" value={menu?.id ?? ""} />
      <input type="hidden" name="partner_id" value={partnerId} />
      {state.importPreview?.ready ? (
        <input
          type="hidden"
          name="confirm_import_signature"
          value={state.importPreview.signature}
        />
      ) : null}
      <FieldGrid>
        <TextField
          label="Menu name"
          name="name"
          defaultValue={menu?.name ?? "Speisekarte"}
          required
        />
        <SelectField
          label="Status"
          name="status"
          value={status}
          onChange={setStatus}
          options={menuStatusOptions}
          required
        />
      </FieldGrid>
      <TextAreaField
        label="Description"
        name="description"
        defaultValue={menu?.description}
      />
      {!menu ? (
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <label htmlFor={`new-menu-import-${partnerId}-${activeMenuFileInput?.id ?? 0}`} className="block text-sm font-semibold text-zinc-900">
            Import menu <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <p className="text-xs leading-5 text-zinc-500">
            Select a ZIP or one or more menu JSON files with an optional assets manifest, or CSV. Name and status are still required.
          </p>
          {menuFileSelections.map((selection, index) => {
            const isActiveInput = index === menuFileSelections.length - 1

            return (
              <input
                key={selection.id}
                id={`new-menu-import-${partnerId}-${selection.id}`}
                type="file"
                name="menu_file"
                multiple
                accept=".zip,.json,.csv,application/zip,application/x-zip-compressed,application/json,text/csv"
                onChange={(event) =>
                  retainNewMenuFileSelection(selection.id, event)
                }
                className={
                  isActiveInput
                    ? "block w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-[#061829] file:px-3 file:py-1.5 file:font-semibold file:text-white"
                    : "hidden"
                }
              />
            )
          })}
          {selectedMenuFiles.length ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-zinc-800">
                  {selectedMenuFiles.length} file{selectedMenuFiles.length === 1 ? "" : "s"} selected
                </p>
                <button
                  type="button"
                  onClick={clearNewMenuFiles}
                  className="text-xs font-semibold text-rose-700 hover:text-rose-800"
                >
                  Clear files
                </button>
              </div>
              <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-xs text-zinc-600">
                {selectedMenuFiles.map((file, index) => (
                  <li key={`${file.name}:${file.size}:${file.lastModified}:${index}`} className="truncate">
                    {file.name}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-zinc-500">
                Choose Files again to add another JSON file. Earlier selections stay attached to Add menu.
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => downloadMenuTemplate("csv")} className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100">CSV template</button>
            <button type="button" onClick={() => downloadMenuTemplate("json")} className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100">JSON template</button>
          </div>
        </div>
      ) : null}
      <ImportPreview preview={state.importPreview} />
      <ActionMessage state={state} />
      <SubmitButton
        disabled={Boolean(menu && !hasMenuChanges)}
        label={state.importPreview?.ready ? "Confirm ZIP import" : menu ? "Save menu" : "Add menu"}
        pendingLabel={state.importPreview?.ready ? "Importing ZIP..." : menu ? "Saving menu..." : "Adding menu..."}
      />
    </form>
  )
}

function DeleteMenuForm({ menuId }: { menuId: string }) {
  const [state, formAction] = useActionState(deleteMenu, initialState)
  const { language } = useAdminLanguage()

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const message =
          language === "de"
            ? "Dieses Menü einschließlich aller Kategorien und Artikel löschen?"
            : "Delete this menu and its categories/items?"
        if (!window.confirm(message)) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="id" value={menuId} />
      <ActionMessage state={state} />
      <SubmitButton
        label="Delete"
        pendingLabel="Deleting menu..."
        size="compact"
        tone="danger"
      />
    </form>
  )
}

function MenuImportDialog({
  categoryCount,
  itemCount,
  menuId,
  onAddonsUpdated,
}: {
  categoryCount: number
  itemCount: number
  menuId: string
  onAddonsUpdated: (
    updates: NonNullable<PartnerActionState["updatedAddons"]>,
  ) => void
}) {
  const { language } = useAdminLanguage()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [importMode, setImportMode] = useState<"append" | "replace" | "update_addons" | "">("")
  const nextFileInputId = useRef(1)
  const selectedImportFilesRef = useRef<File[]>([])
  const [fileSelections, setFileSelections] = useState<
    Array<{ id: number; files: File[] }>
  >([{ id: 0, files: [] }])
  const importMenuWithSelectedFiles = useCallback(
    async (previousState: PartnerActionState, formData: FormData) => {
      formData.delete("menu_file")
      selectedImportFilesRef.current.forEach((file) =>
        formData.append("menu_file", file),
      )
      return importMenuFile(previousState, formData)
    },
    [],
  )
  const [state, formAction] = useActionState(
    importMenuWithSelectedFiles,
    initialState,
  )
  const formRef = useActionSuccess(state, (result) => {
    if (result.updatedAddons?.length) {
      onAddonsUpdated(result.updatedAddons)
    }
    if (!result.issues) {
      setOpen(false)
      if (!result.updatedAddons?.length) router.refresh()
    }
  })
  const hasExistingContent = categoryCount > 0 || itemCount > 0
  const selectedFiles = fileSelections.flatMap((selection) => selection.files)

  function retainMenuFileSelection(
    inputId: number,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const incomingFiles = Array.from(event.currentTarget.files ?? [])
    if (!incomingFiles.length) return

    setFileSelections((current) => {
      const nextSelections = [
        ...current.map((selection) =>
          selection.id === inputId
            ? { ...selection, files: incomingFiles }
            : selection,
        ),
        { id: nextFileInputId.current++, files: [] },
      ]
      selectedImportFilesRef.current = nextSelections.flatMap(
        (selection) => selection.files,
      )
      return nextSelections
    })
  }

  function clearMenuFiles() {
    selectedImportFilesRef.current = []
    setFileSelections([{ id: nextFileInputId.current++, files: [] }])
  }

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setImportMode(hasExistingContent ? "" : "append")
          selectedImportFilesRef.current = []
          setFileSelections([{ id: nextFileInputId.current++, files: [] }])
          setOpen(true)
        }}
        className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100"
      >
        Import menu
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-[#061829]/65 p-0 backdrop-blur-sm sm:items-center sm:p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-import-dialog-title"
            className="w-full max-w-lg overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
              <div>
                <h3 id="menu-import-dialog-title" className="text-lg font-bold text-zinc-950">Import menu</h3>
                <p className="mt-0.5 text-xs text-zinc-500">Select a Knobi ZIP, or multiple menu JSON files and assets_manifest.json together. CSV remains supported.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu import"
                className="grid size-9 place-items-center rounded-full border border-zinc-300 bg-white text-lg text-zinc-600 hover:bg-zinc-100"
              >
                ×
              </button>
            </header>
            <form
              ref={formRef}
              action={formAction}
              className="space-y-4 p-4"
              onSubmit={(event) => {
                if (
                  importMode === "replace" &&
                  !window.confirm(
                    language === "de"
                      ? `Aktuelles Menü ersetzen? Nach erfolgreichem Import werden ${categoryCount} Kategorien und ${itemCount} Artikel entfernt.`
                      : `Replace the current menu? This will remove ${categoryCount} categories and ${itemCount} items after the new file is imported successfully.`,
                  )
                ) {
                  event.preventDefault()
                }
              }}
            >
              <input type="hidden" name="menu_id" value={menuId} />
              {state.importPreview?.ready ? (
                <input
                  type="hidden"
                  name="confirm_import_signature"
                  value={state.importPreview.signature}
                />
              ) : null}
              {hasExistingContent ? <p className="text-xs leading-5 text-zinc-600">
                This menu already has {categoryCount} categories and {itemCount} items. Choose how the imported content should be handled.
              </p> : (
                <>
                  <input type="hidden" name="import_mode" value="append" />
                  <p className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-900">
                    This menu is empty. The imported categories and items will become its menu content.
                  </p>
                </>
              )}
              {hasExistingContent ? (
                <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-zinc-900">Import behavior</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className={`cursor-pointer rounded-lg border p-3 transition ${importMode === "append" ? "border-teal-600 bg-teal-50 ring-2 ring-teal-100" : "border-zinc-200 bg-white hover:border-zinc-300"}`}>
                    <span className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="import_mode"
                        value="append"
                        checked={importMode === "append"}
                        onChange={() => setImportMode("append")}
                        required
                        className="mt-0.5 size-4 accent-teal-700"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-zinc-900">Append</span>
                        <span className="mt-1 block text-xs leading-5 text-zinc-500">Keep the current menu and add the imported categories after it.</span>
                      </span>
                    </span>
                  </label>
                  <label className={`cursor-pointer rounded-lg border p-3 transition ${importMode === "replace" ? "border-rose-500 bg-rose-50 ring-2 ring-rose-100" : "border-zinc-200 bg-white hover:border-zinc-300"}`}>
                    <span className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="import_mode"
                        value="replace"
                        checked={importMode === "replace"}
                        onChange={() => setImportMode("replace")}
                        required
                        className="mt-0.5 size-4 accent-rose-700"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-zinc-900">Replace</span>
                        <span className="mt-1 block text-xs leading-5 text-zinc-500">Replace all current categories and items after the new import succeeds.</span>
                      </span>
                    </span>
                  </label>
                  <label className={`cursor-pointer rounded-lg border p-3 transition ${importMode === "update_addons" ? "border-sky-600 bg-sky-50 ring-2 ring-sky-100" : "border-zinc-200 bg-white hover:border-zinc-300"}`}>
                    <span className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="import_mode"
                        value="update_addons"
                        checked={importMode === "update_addons"}
                        onChange={() => setImportMode("update_addons")}
                        required
                        className="mt-0.5 size-4 accent-sky-700"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-zinc-900">Update add-ons</span>
                        <span className="mt-1 block text-xs leading-5 text-zinc-500">Match existing categories and items by name and update only their add-ons. Images and other fields stay unchanged.</span>
                      </span>
                    </span>
                  </label>
                </div>
                </fieldset>
              ) : null}
              {fileSelections.map((selection, index) => {
                const isActiveInput = index === fileSelections.length - 1

                return (
                  <input
                    key={selection.id}
                    type="file"
                    name="menu_file"
                    multiple
                    accept=".zip,.json,.csv,application/zip,application/x-zip-compressed,application/json,text/csv"
                    required={isActiveInput && selectedFiles.length === 0}
                    onChange={(event) =>
                      retainMenuFileSelection(selection.id, event)
                    }
                    className={
                      isActiveInput
                        ? "block w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-[#061829] file:px-3 file:py-1.5 file:font-semibold file:text-white"
                        : "hidden"
                    }
                  />
                )
              })}
              {selectedFiles.length ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-zinc-800">
                      {selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"} selected
                    </p>
                    <button
                      type="button"
                      onClick={clearMenuFiles}
                      className="text-xs font-semibold text-rose-700 hover:text-rose-800"
                    >
                      Clear files
                    </button>
                  </div>
                  <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-xs text-zinc-600">
                    {selectedFiles.map((file, index) => (
                      <li key={`${file.name}:${file.size}:${file.lastModified}:${index}`} className="truncate">
                        {file.name}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-zinc-500">
                    Open the picker again to add more files; these selections will be retained.
                  </p>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <SubmitButton
                  label={state.importPreview?.ready ? "Confirm ZIP import" : "Import menu"}
                  pendingLabel={state.importPreview?.ready ? "Importing ZIP..." : "Importing menu..."}
                  size="compact"
                />
                <button type="button" onClick={() => downloadMenuTemplate("csv")} className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100">
                  CSV template
                </button>
                <button type="button" onClick={() => downloadMenuTemplate("json")} className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100">
                  JSON template
                </button>
              </div>
              <ImportPreview preview={state.importPreview} />
              <ActionMessage state={state} />
            </form>
          </section>
        </div>
      ) : null}
    </>
  )
}

function downloadMenuTemplate(format: "csv" | "json") {
  const jsonTemplate = {
    categories: [
      {
        name: "Main dishes",
        image_url: "",
        items: [
          {
            name: "Example item",
            description: "Optional description",
            price: 9.5,
            currency: "EUR",
            image_url: "",
            tags: ["vegetarian"],
            allergens: ["gluten"],
            is_popular: false,
            addons: [{ title: "Extra cheese", description: "Optional description", cost: 1.5 }],
          },
        ],
      },
    ],
  }
  const csvTemplate = [
    "category,category_image_url,item_name,description,price,currency,image_url,tags,allergens,is_popular,addons",
    'Main dishes,,Example item,Optional description,9.50,EUR,,vegetarian,gluten,false,"[{""title"":""Extra cheese"",""description"":""Optional description"",""cost"":1.5}]"',
  ].join("\r\n")
  const content = format === "json" ? JSON.stringify(jsonTemplate, null, 2) : csvTemplate
  const url = URL.createObjectURL(new Blob([content], { type: format === "json" ? "application/json" : "text/csv" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `menu-template.${format}`
  anchor.click()
  URL.revokeObjectURL(url)
}

function MenuCategoryCard({
  category,
  imageUploading,
  onDelete,
  onDuplicate,
  onEdit,
}: {
  category: MenuCategory
  imageUploading?: boolean
  onDelete: (state: PartnerActionState) => void
  onDuplicate: () => void
  onEdit: () => void
}) {
  return (
    <article className="group relative aspect-[1200/504] w-full overflow-hidden rounded-xl border border-zinc-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg">
      <button
        type="button"
        onClick={onEdit}
        className="absolute inset-0 size-full text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-300"
        title="Edit category"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={`${category.name || "Menu category"} picture`}
          src={category.image_url || uploadPlaceholderSrc}
          className={`absolute inset-0 size-full ${category.image_url ? "object-cover" : "object-contain p-7"}`}
        />
        <span className="absolute inset-0 bg-gradient-to-t from-[#061829]/95 via-[#061829]/15 to-transparent" />
        <span className="absolute inset-x-0 bottom-0 block p-3 text-white">
          <span className="block truncate text-sm font-bold">
            {category.name || "Untitled category"}
          </span>
          <span className="mt-1 block text-[11px] font-semibold text-white/75">
            {category.items.length} {category.items.length === 1 ? "item" : "items"}
          </span>
        </span>
      </button>
      {imageUploading ? (
        <span role="status" className="absolute left-2 top-2 z-20 inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">
          <LoadingSpinner className="size-3" /> Uploading image…
        </span>
      ) : null}
      {category.id ? (
        <DuplicateMenuCategoryButton
          categoryId={category.id}
          categoryName={category.name}
          onDuplicated={onDuplicate}
        />
      ) : null}
      {category.id ? (
        <DeleteMenuCategoryForm
          categoryId={category.id}
          categoryName={category.name}
          iconOnly
          onDeleted={onDelete}
        />
      ) : null}
    </article>
  )
}

function MenuCategoryEditorDialog({
  defaultSortOrder,
  editor,
  menuId,
  onClose,
  onDeleted,
  onSaved,
}: {
  defaultSortOrder: number
  editor: MenuCategoryEditorState | null
  menuId: string
  onClose: () => void
  onDeleted: (state: PartnerActionState) => void
  onSaved: (state: PartnerActionState, imageFile?: File | null) => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editor) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [editor, onClose])

  if (!editor || !menuId) return null
  const category = editor.mode === "edit" ? editor.category : undefined

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#061829]/65 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-category-dialog-title"
        className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
          <h3 id="menu-category-dialog-title" className="text-lg font-bold text-zinc-950">
            {category ? "Edit menu category" : "Add menu category"}
          </h3>
          <div className="flex items-center gap-2">
            {category?.id ? (
              <DeleteMenuCategoryForm categoryId={category.id} onDeleted={onDeleted} />
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-9 place-items-center rounded-full border border-zinc-300 bg-white text-lg text-zinc-600 transition hover:bg-zinc-100"
            >
              ×
            </button>
          </div>
        </header>
        <div className="overflow-y-auto p-3 sm:p-4">
          <MenuCategoryForm
            category={category}
            defaultSortOrder={defaultSortOrder}
            menuId={menuId}
            onSaved={onSaved}
          />
        </div>
      </section>
    </div>
  )
}

function MenuCategoryForm({
  category,
  defaultSortOrder = 0,
  menuId,
  onSaved,
}: {
  category?: MenuCategory
  defaultSortOrder?: number
  menuId: string
  onSaved?: (state: PartnerActionState, imageFile?: File | null) => void
}) {
  const [state, setState] = useState(initialState)
  const [isPending, startTransition] = useTransition()

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        const imageValue = formData.get("image_file")
        const imageFile = imageValue instanceof File && imageValue.size > 0
          ? imageValue
          : null
        if (imageFile) formData.delete("image_file")

        startTransition(async () => {
          try {
            const result = await saveMenuCategory(initialState, formData)
            setState(result)
            dispatchActionToast(result)
            if (result.ok) {
              onSaved?.(result, imageFile)
            }
          } catch {
            const result = {
              ok: false,
              message: "Unable to save the menu category.",
            }
            setState(result)
            dispatchActionToast(result)
          }
        })
      }}
    >
      <input type="hidden" name="id" value={category?.id ?? ""} />
      <input type="hidden" name="menu_id" value={menuId} />
      <MediaUploadField
        key={`menu-category-${category?.image_url ?? category?.id ?? "new"}`}
        label="Menu category picture"
        fileName="image_file"
        existingName="existing_image_url"
        removeName="remove_image"
        currentUrl={category?.image_url}
        spec={partnerMediaSpecs.menuCategory}
        compact
        dense
      />
      <TextField
        label="Name"
        name="name"
        defaultValue={category?.name}
        required
        showCharacterCount={false}
      />
      <FieldGrid>
        <TextField
          label="Position in menu"
          name="sort_order"
          type="number"
          min={0}
          defaultValue={category?.sort_order ?? defaultSortOrder}
        />
      </FieldGrid>
      <ActionMessage state={state} toast={false} />
      <SubmitButton
        label={category ? "Save category" : "Add category"}
        pendingLabel={category ? "Saving category..." : "Adding category..."}
        pendingOverride={isPending}
      />
    </form>
  )
}

function DeleteMenuCategoryForm({
  categoryId,
  categoryName,
  iconOnly = false,
  onDeleted,
}: {
  categoryId: string
  categoryName?: string | null
  iconOnly?: boolean
  onDeleted?: (state: PartnerActionState) => void
}) {
  const [state, setState] = useState(initialState)
  const [isPending, startTransition] = useTransition()
  const { language } = useAdminLanguage()

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const name = categoryName || (language === "de" ? "diese Menükategorie" : "this menu category")
        const message =
          language === "de"
            ? `${name} einschließlich aller Artikel löschen?`
            : `Delete ${name} and all of its items?`
        if (!window.confirm(message)) {
          return
        }

        const formData = new FormData(event.currentTarget)
        startTransition(async () => {
          try {
            const result = await deleteMenuCategory(initialState, formData)
            setState(result)
            dispatchActionToast(result)
            if (result.ok) onDeleted?.(result)
          } catch {
            const result = {
              ok: false,
              message: "Unable to delete the menu category.",
            }
            setState(result)
            dispatchActionToast(result)
          }
        })
      }}
    >
      <input type="hidden" name="id" value={categoryId} />
      {!iconOnly ? <ActionMessage state={state} toast={false} /> : null}
      {iconOnly ? (
        <IconDeleteSubmitButton
          label={`Delete ${categoryName || "menu category"}`}
          pendingOverride={isPending}
        />
      ) : (
        <SubmitButton
          label="Delete"
          pendingLabel="Deleting category..."
          pendingOverride={isPending}
          size="tiny"
          tone="danger"
        />
      )}
    </form>
  )
}

function MenuItemCard({
  item,
  imageUploading,
  onDelete,
  onDuplicate,
  onEdit,
}: {
  item: MenuItem
  imageUploading?: boolean
  onDelete: (state: PartnerActionState) => void
  onDuplicate: () => void
  onEdit: () => void
}) {
  return (
    <article className="group relative aspect-square min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg">
      <button
        type="button"
        onClick={onEdit}
        className="absolute inset-0 size-full text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-300"
        title="Edit item"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={`${item.name || "Menu item"} picture`}
          src={item.image_url || uploadPlaceholderSrc}
          className={`absolute inset-0 size-full ${item.image_url ? "object-cover" : "object-contain p-6"}`}
        />
        <span className="absolute inset-0 bg-gradient-to-t from-[#061829]/95 via-[#061829]/12 to-transparent" />
        <span className="absolute inset-x-0 bottom-0 block p-2.5 text-white">
          <span className="block truncate text-sm font-bold">
            {item.name || "Untitled item"}
          </span>
          <span className="mt-1 flex items-center justify-between gap-2 text-[11px] font-semibold text-white/80">
            <span className="truncate">{item.is_popular ? "Popular" : "Menu item"}</span>
            <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-white">
              {formatPrice(item.price, item.currency)}
            </span>
          </span>
        </span>
      </button>
      {imageUploading ? (
        <span role="status" className="absolute left-2 top-2 z-20 inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">
          <LoadingSpinner className="size-3" /> Uploading image…
        </span>
      ) : null}
      <button
        type="button"
        onClick={onDuplicate}
        aria-label={`Duplicate ${item.name || "menu item"}`}
        title="Duplicate item"
        className="absolute right-12 top-2 z-10 grid size-8 place-items-center rounded-full border border-white/70 bg-white/92 text-sm font-bold text-[#061829] shadow-md backdrop-blur transition hover:scale-105 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        ⧉
      </button>
      {item.id ? (
        <DeleteMenuItemForm
          iconOnly
          itemId={item.id}
          itemName={item.name}
          onDeleted={onDelete}
        />
      ) : null}
    </article>
  )
}

function MenuItemEditorDialog({
  categoryOptions,
  defaultCategoryId,
  defaultSortOrder,
  editor,
  menuId,
  onClose,
  onDeleted,
  onSaved,
}: {
  categoryOptions: { value: string; label: string }[]
  defaultCategoryId: string
  defaultSortOrder: number
  editor: MenuItemEditorState | null
  menuId: string
  onClose: () => void
  onDeleted: (state: PartnerActionState) => void
  onSaved: (state: PartnerActionState, imageFile?: File | null) => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editor) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const timeout = window.setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>("input:not([type='hidden']):not([type='file']), select, textarea, button")
        ?.focus()
    }, 0)

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", closeOnEscape)

    return () => {
      window.clearTimeout(timeout)
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [editor, onClose])

  if (!editor || !menuId) return null

  const item = editor.mode === "create" ? undefined : editor.item
  const title =
    editor.mode === "edit"
      ? "Edit menu item"
      : editor.mode === "duplicate"
        ? "Duplicate menu item"
        : "Add menu item"
  const description =
    editor.mode === "duplicate"
      ? "Review the copied details, then create the new item."
      : "Keep the menu focused by editing one item at a time."

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#061829]/65 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-item-dialog-title"
        aria-describedby="menu-item-dialog-description"
        className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:max-h-[88dvh] sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
          <div className="min-w-0">
            <h3 id="menu-item-dialog-title" className="text-lg font-bold tracking-tight text-zinc-950">
              {title}
            </h3>
            <p id="menu-item-dialog-description" className="mt-0.5 text-xs text-zinc-500">
              {description}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {editor.mode === "edit" && item?.id ? (
              <DeleteMenuItemForm
                itemId={item.id}
                itemName={item.name}
                onDeleted={onDeleted}
              />
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-9 place-items-center rounded-full border border-zinc-300 bg-white text-lg font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950"
            >
              ×
            </button>
          </div>
        </header>
        <div className="overflow-y-auto p-3 sm:p-4">
          <MenuItemForm
            categoryOptions={categoryOptions}
            defaultCategoryId={defaultCategoryId}
            defaultSortOrder={defaultSortOrder}
            imageInputId={`menu-item-dialog-image-${item?.id ?? "new"}`}
            intent={editor.mode}
            item={item}
            menuId={menuId}
            onSaved={onSaved}
          />
        </div>
      </section>
    </div>
  )
}

function MenuItemForm({
  categoryOptions,
  defaultCategoryId = "",
  defaultSortOrder = 0,
  imageInputId,
  item,
  intent = item ? "edit" : "create",
  menuId,
  onSaved,
}: {
  categoryOptions: { value: string; label: string }[]
  defaultCategoryId?: string
  defaultSortOrder?: number
  imageInputId?: string
  item?: MenuItem
  intent?: "create" | "edit" | "duplicate"
  menuId: string
  onSaved?: (state: PartnerActionState, imageFile?: File | null) => void
}) {
  const [state, setState] = useState(initialState)
  const [isPending, startTransition] = useTransition()
  const isEditing = intent === "edit"
  const defaultName =
    intent === "duplicate" && item?.name ? `${item.name} (copy)` : item?.name

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        const imageValue = formData.get("image_file")
        const imageFile = imageValue instanceof File && imageValue.size > 0
          ? imageValue
          : null
        if (imageFile) formData.delete("image_file")

        startTransition(async () => {
          try {
            const result = await saveMenuItem(initialState, formData)
            setState(result)
            dispatchActionToast(result)
            if (result.ok) {
              onSaved?.(result, imageFile)
            }
          } catch {
            const result = { ok: false, message: "Unable to save the menu item." }
            setState(result)
            dispatchActionToast(result)
          }
        })
      }}
    >
      <input type="hidden" name="id" value={isEditing ? item?.id ?? "" : ""} />
      <input type="hidden" name="menu_id" value={menuId} />
      {item?.is_stamp_eligible ? (
        <input type="hidden" name="is_stamp_eligible" value="on" />
      ) : null}
      <MediaUploadField
        key={`menu-item-${item?.image_url ?? item?.id ?? "new"}`}
        label="Menu item picture"
        fileName="image_file"
        existingName="existing_image_url"
        removeName="remove_image"
        currentUrl={item?.image_url}
        spec={partnerMediaSpecs.menuItem}
        compact
        dense
        inputId={imageInputId}
      />
      <FieldGrid>
        <TextField
          label="Item name"
          name="name"
          defaultValue={defaultName}
          required
          showCharacterCount={false}
        />
        <SelectField
          label="Category"
          name="category_id"
          defaultValue={item?.category_id ?? defaultCategoryId}
          options={withCurrentOption(categoryOptions, item?.category_id)}
        />
        <TextField
          label="Price"
          name="price"
          type="number"
          step="0.01"
          defaultValue={item?.price}
        />
        <SelectField
          label="Currency"
          name="currency"
          defaultValue={item?.currency ?? "EUR"}
          options={menuCurrencyOptions}
          required
        />
        <TextField
          label="Position in category"
          name="sort_order"
          type="number"
          min={0}
          defaultValue={
            intent === "duplicate"
              ? defaultSortOrder
              : item?.sort_order ?? defaultSortOrder
          }
        />
        <TextField
          label="Tags"
          name="tags"
          defaultValue={item?.tags?.join(", ")}
          showCharacterCount={false}
        />
        <TextField
          label="Allergens"
          name="allergens"
          defaultValue={item?.allergens?.join(", ")}
          showCharacterCount={false}
        />
      </FieldGrid>
      <TextAreaField
        label="Description"
        name="description"
        defaultValue={item?.description}
        showCharacterCount={false}
      />
      <MenuItemAddonsField defaultValue={item?.addons ?? []} />
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckboxField
          label="Popular"
          name="is_popular"
          defaultChecked={item?.is_popular ?? false}
        />
      </div>
      <ActionMessage state={state} />
      <SubmitButton
        label={isEditing ? "Save item" : intent === "duplicate" ? "Duplicate item" : "Add item"}
        pendingLabel={isEditing ? "Saving item..." : "Adding item..."}
        pendingOverride={isPending}
      />
    </form>
  )
}

function MenuItemAddonsField({
  defaultValue,
  name = "addons",
}: {
  defaultValue: MenuItemAddon[]
  name?: string
}) {
  const [addons, setAddons] = useState(() =>
    defaultValue.map((addon) => ({
      title: addon.title ?? "",
      description: addon.description ?? "",
      cost: String(addon.cost ?? ""),
    })),
  )
  const serialized = addons.map((addon) => ({
    title: addon.title.trim(),
    description: addon.description.trim() || null,
    cost: addon.cost === "" ? 0 : Number(addon.cost),
  }))

  return (
    <fieldset className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3">
      <input type="hidden" name={name} value={JSON.stringify(serialized)} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <legend className="text-sm font-semibold text-zinc-900">Add-ons</legend>
          <p className="mt-0.5 text-xs text-zinc-500">Optional extras customers can add to this item.</p>
        </div>
        <button
          type="button"
          onClick={() => setAddons((current) => [...current, { title: "", description: "", cost: "" }])}
          className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
        >
          + Add option
        </button>
      </div>
      {addons.length ? (
        <div className="space-y-2">
          {addons.map((addon, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-zinc-200 bg-white p-2.5 sm:grid-cols-[1fr_1.35fr_7rem_auto] sm:items-end">
              <TextField
                label="Title"
                name={`addon_title_${index}`}
                value={addon.title}
                required
                showCharacterCount={false}
                onChange={(title) => setAddons((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, title } : entry))}
              />
              <TextField
                label="Description (optional)"
                name={`addon_description_${index}`}
                value={addon.description}
                showCharacterCount={false}
                onChange={(description) => setAddons((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, description } : entry))}
              />
              <TextField
                label="Cost"
                name={`addon_cost_${index}`}
                type="number"
                min={0}
                step="0.01"
                value={addon.cost}
                required
                showCharacterCount={false}
                onChange={(cost) => setAddons((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, cost } : entry))}
              />
              <button
                type="button"
                aria-label={`Remove add-on ${index + 1}`}
                onClick={() => setAddons((current) => current.filter((_, entryIndex) => entryIndex !== index))}
                className="h-9 rounded-md border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-4 text-center text-xs text-zinc-500">No add-ons yet.</p>
      )}
    </fieldset>
  )
}

function DeleteMenuItemForm({
  itemId,
  itemName,
  iconOnly = false,
  onDeleted,
}: {
  itemId: string
  itemName?: string | null
  iconOnly?: boolean
  onDeleted?: (state: PartnerActionState) => void
}) {
  const [state, setState] = useState(initialState)
  const [isPending, startTransition] = useTransition()
  const { language } = useAdminLanguage()

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const name = itemName || (language === "de" ? "Diesen Menüartikel" : "this menu item")
        const message =
          language === "de" ? `${name} löschen?` : `Delete ${name}?`
        if (!window.confirm(message)) {
          return
        }

        const formData = new FormData(event.currentTarget)
        startTransition(async () => {
          try {
            const result = await deleteMenuItem(initialState, formData)
            setState(result)
            dispatchActionToast(result)
            if (result.ok) onDeleted?.(result)
          } catch {
            const result = {
              ok: false,
              message: "Unable to delete the menu item.",
            }
            setState(result)
            dispatchActionToast(result)
          }
        })
      }}
    >
      <input type="hidden" name="id" value={itemId} />
      {!iconOnly ? <ActionMessage state={state} toast={false} /> : null}
      {iconOnly ? (
        <IconDeleteSubmitButton
          label={`Delete ${itemName || "menu item"}`}
          pendingOverride={isPending}
        />
      ) : (
        <SubmitButton
          label="Delete"
          pendingLabel="Deleting item..."
          pendingOverride={isPending}
          size="tiny"
          tone="danger"
        />
      )}
    </form>
  )
}

function DuplicateMenuCategoryButton({
  categoryId,
  categoryName,
  onDuplicated,
}: {
  categoryId: string
  categoryName?: string | null
  onDuplicated: () => void
}) {
  const [state, setState] = useState(initialState)
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Duplicate ${categoryName || "menu category"} and its items`}
      title="Duplicate category and items"
      onClick={() => startTransition(async () => {
        const formData = new FormData()
        formData.set("id", categoryId)
        const result = await duplicateMenuCategory(initialState, formData)
        setState(result)
        dispatchActionToast(result)
        if (result.ok) onDuplicated()
      })}
      className="absolute right-12 top-2 z-10 grid size-8 place-items-center rounded-full border border-white/70 bg-white/92 text-sm font-bold text-[#061829] shadow-md transition hover:scale-105 hover:bg-white disabled:opacity-60"
    >
      {pending ? <LoadingSpinner className="size-3" /> : "⧉"}
      <span className="sr-only">{state.message}</span>
    </button>
  )
}

function StampProgressPanel({
  embedded = false,
  progress,
}: {
  embedded?: boolean
  progress: StampCardProgress[]
}) {
  const visibleProgress = progress.slice(0, stampProgressDisplayLimit)

  const content = progress.length ? (
        <div className="space-y-3">
          <ResultLimitNote
            itemLabel="progress rows"
            totalCount={progress.length}
            visibleCount={visibleProgress.length}
          />
          <div className="max-h-80 overflow-auto rounded-md border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-white text-xs uppercase tracking-[0.12em] text-zinc-500">
                <tr>
                  <th className="py-2 pr-4 pl-3 font-semibold">User</th>
                  <th className="py-2 pr-4 font-semibold">Current card</th>
                  <th className="py-2 pr-4 font-semibold">Completed</th>
                  <th className="py-2 pr-4 font-semibold">Lifetime</th>
                  <th className="py-2 pr-3 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {visibleProgress.map((row) => (
                  <tr key={`${row.user_id}-${row.partner_id}`}>
                    <td className="py-3 pr-4 pl-3 text-zinc-700">
                      {row.user_name || row.user_email || shortId(row.user_id)}
                    </td>
                    <td className="py-3 pr-4 font-medium text-zinc-950">
                      {formatOptionalNumber(row.current_card_stamp_count)} /{" "}
                      {MAX_STAMP_CARD_STAMPS}
                    </td>
                    <td className="py-3 pr-4 text-zinc-700">
                      {formatOptionalNumber(row.completed_cards)}
                    </td>
                    <td className="py-3 pr-4 text-zinc-700">
                      {formatOptionalNumber(row.lifetime_stamp_count)}
                    </td>
                    <td className="py-3 pr-3 text-zinc-500">
                      {formatDateTime(row.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
    <EmptyState>No stamp-card progress rows loaded for this partner.</EmptyState>
  )

  if (embedded) {
    return content
  }

  return (
    <EditorShell
      title="Stamp-card progress"
      description={`Progress comes from stamp_cards_progress_view. MVP cards complete at ${MAX_STAMP_CARD_STAMPS} stamps.`}
      collapsible
      defaultOpen={false}
    >
      {content}
    </EditorShell>
  )
}

function RedemptionHistoryPanel({
  embedded = false,
  partner,
  visits,
}: {
  embedded?: boolean
  partner: PartnerWithDeals
  visits: Visit[]
}) {
  const visibleVisits = visits.slice(0, redemptionHistoryDisplayLimit)

  const content = (
      <div className="space-y-4">
        {visits.length ? (
          <>
            <ResultLimitNote
              itemLabel="visits"
              totalCount={visits.length}
              visibleCount={visibleVisits.length}
            />
            <div className="max-h-[42rem] overflow-y-auto pr-2">
              <div className="space-y-4">
                {visibleVisits.map((visit) => (
                  <div
                    key={visit.id ?? `${visit.partner_id}-${visit.visited_at}`}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-zinc-950">
                          {`Visit ${shortId(visit.id)}`}
                        </h3>
                        <p className="mt-1 text-sm text-zinc-600">
                          {visit.user_name ||
                            visit.user_email ||
                            shortId(visit.user_id)}
                          {" - "}
                          {formatDateTime(visit.visited_at)}
                        </p>
                      </div>
                      <Badge>{visit.redemption_status || "status unknown"}</Badge>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2 xl:grid-cols-3">
                      <Info
                        label="Partner"
                        value={partner.name || shortId(visit.partner_id)}
                      />
                      <Info
                        label="Scanned by"
                        value={
                          visit.staff_user_name ||
                          visit.staff_user_email ||
                          shortId(visit.staff_user_id)
                        }
                      />
                      <Info
                        label="Selected direct deal"
                        value={shortId(visit.selected_direct_deal_id)}
                      />
                      <Info
                        label="Fallback deal"
                        value={shortId(visit.applied_fallback_deal_id)}
                      />
                      <Info
                        label="Base stamps"
                        value={formatOptionalNumber(visit.base_stamp_count)}
                      />
                      <Info
                        label="Bonus stamps"
                        value={formatOptionalNumber(visit.bonus_stamp_count)}
                      />
                      <Info
                        label="Total stamp delta"
                        value={formatOptionalNumber(visit.total_stamp_delta)}
                      />
                      <Info
                        label="Deal redemptions"
                        value={formatIdList(
                          visit.deal_redemptions.map(
                            (redemption) => redemption.id,
                          ),
                        )}
                      />
                      <Info
                        label="QR tokens"
                        value={formatIdList(
                          visit.qr_tokens.map(
                            (token) =>
                              token.qr_token ?? token.token ?? token.id,
                          ),
                        )}
                      />
                    </div>
                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-semibold text-zinc-800">
                        Applied benefits
                      </p>
                      {visit.applied_benefits.length ? (
                        <div className="grid gap-2">
                          {visit.applied_benefits.map((benefit) => (
                            <div
                              key={
                                benefit.id ??
                                `${benefit.visit_id}-${benefit.source_type}`
                              }
                              className="rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-600"
                            >
                              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                <Info
                                  label="Category"
                                  value={formatBenefitCategory(
                                    benefit.benefit_category,
                                  )}
                                />
                                <Info
                                  label="Discount"
                                  value={formatRewardValue(
                                    benefit.discount_type,
                                    benefit.discount_value,
                                  )}
                                />
                                <Info
                                  label="Artikelname"
                                  value={benefit.reward_item || "Not set"}
                                />
                                <Info
                                  label="Stamp delta"
                                  value={formatOptionalNumber(
                                    benefit.stamp_delta,
                                  )}
                                />
                                <Info
                                  label="Savings"
                                  value={formatOptionalNumber(benefit.savings)}
                                />
                                <Info
                                  label="Source"
                                  value={formatBenefitSource(
                                    benefit.source_type,
                                  )}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-500">
                          No applied benefit rows loaded for this visit.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <EmptyState>No redemption visits loaded for this partner.</EmptyState>
        )}
      </div>
  )

  if (embedded) {
    return content
  }

  return (
    <EditorShell
      title="Redemption history"
      description="Visits can contain multiple applied benefits; the server decides the full reward bundle."
      collapsible
      defaultOpen={false}
    >
      {content}
    </EditorShell>
  )
}

function ComebackCandidatesSection({
  prefix,
  visits,
  inactivityValue,
  inactivityUnit,
  minVisitCount,
  maxVisitCount,
  onInactivityValueChange,
  onInactivityUnitChange,
  onMinVisitCountChange,
  onMaxVisitCountChange,
  required,
  validationMessages,
}: {
  prefix: string
  visits: Visit[]
  inactivityValue: string
  inactivityUnit: string
  minVisitCount: string
  maxVisitCount: string
  onInactivityValueChange: (value: string) => void
  onInactivityUnitChange: (value: string) => void
  onMinVisitCountChange: (value: string) => void
  onMaxVisitCountChange: (value: string) => void
  required: boolean
  validationMessages: DealValidationMessages
}) {
  const [query, setQuery] = useState("")
  const candidates = useMemo(() => buildComebackCandidates(visits), [visits])
  const parsedMinVisitCount = parseOptionalNumberInput(minVisitCount)
  const parsedMaxVisitCount = parseOptionalNumberInput(maxVisitCount)
  const inactiveThresholdDays = periodToDays(
    parseOptionalNumberInput(inactivityValue) ?? 0,
    inactivityUnit,
  )
  const filteredCandidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return candidates.filter((candidate) => {
      const matchesMinVisitCount =
        parsedMinVisitCount === null ||
        candidate.visitCount >= Math.floor(parsedMinVisitCount)
      const matchesMaxVisitCount =
        parsedMaxVisitCount === null ||
        candidate.visitCount <= Math.floor(parsedMaxVisitCount)
      const matchesInactiveWindow =
        candidate.inactiveDays >= inactiveThresholdDays
      const matchesQuery =
        !normalizedQuery ||
        [candidate.userLabel, candidate.userEmail, candidate.userId]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)

      return (
        matchesMinVisitCount &&
        matchesMaxVisitCount &&
        matchesInactiveWindow &&
        matchesQuery
      )
    })
  }, [
    candidates,
    inactiveThresholdDays,
    parsedMaxVisitCount,
    parsedMinVisitCount,
    query,
  ])
  const visibleCandidates = filteredCandidates.slice(
    0,
    comebackCandidateDisplayLimit,
  )

  return (
    <FormSection
      title="Comeback candidates"
      compact
    >
      <div className="space-y-4">
        <p className="text-xs leading-5 text-zinc-500">
          Configure inactive-user filters and preview matching loaded users.
          The saved deal stores the filter config, not explicit user IDs.
        </p>
        <FieldGrid compact>
          <TextField
            label="Inactive for at least"
            name={`${prefix}inactivity_value`}
            type="number"
            min={1}
            value={inactivityValue}
            onChange={onInactivityValueChange}
            hint={dealFieldHelp.inactivityValue}
            required={required}
            warning={validationMessages.inactivityValue}
          />
          <SelectField
            label="Inactivity unit"
            name={`${prefix}inactivity_unit`}
            value={inactivityUnit}
            options={inactivityUnitOptions}
            onChange={onInactivityUnitChange}
            required={required}
          />
          <TextField
            label="Minimum visits"
            name={`${prefix}min_visit_count`}
            type="number"
            min={0}
            value={minVisitCount}
            onChange={onMinVisitCountChange}
            hint="Optional."
          />
          <TextField
            label="Maximum visits"
            name={`${prefix}max_visit_count`}
            type="number"
            min={0}
            value={maxVisitCount}
            onChange={onMaxVisitCountChange}
            hint="Optional."
            warning={validationMessages.visitCountRange}
          />
          <TextField
            label="Search user"
            name={`${prefix}comeback_user_search`}
            type="search"
            value={query}
            onChange={setQuery}
          />
        </FieldGrid>

        {filteredCandidates.length ? (
          <div className="space-y-3">
            <ResultLimitNote
              itemLabel="comeback candidates"
              totalCount={filteredCandidates.length}
              visibleCount={visibleCandidates.length}
            />
            <div className="max-h-96 overflow-auto rounded-md border border-zinc-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-white text-xs uppercase tracking-[0.12em] text-zinc-500">
                  <tr>
                    <th className="py-2 pr-4 pl-3 font-semibold">User</th>
                    <th className="py-2 pr-4 font-semibold">Visits</th>
                    <th className="py-2 pr-4 font-semibold">Usual cadence</th>
                    <th className="py-2 pr-4 font-semibold">Last visit</th>
                    <th className="py-2 pr-3 font-semibold">Inactive</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {visibleCandidates.map((candidate) => (
                    <tr key={candidate.userId}>
                      <td className="py-3 pr-4 pl-3 text-zinc-700">
                        <span className="block font-medium text-zinc-950">
                          {candidate.userLabel}
                        </span>
                        <span className="block text-xs text-zinc-500">
                          {candidate.userEmail || shortId(candidate.userId)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-zinc-700">
                        {candidate.visitCount}
                      </td>
                      <td className="py-3 pr-4 text-zinc-700">
                        {formatDays(candidate.averageIntervalDays)}
                      </td>
                      <td className="py-3 pr-4 text-zinc-700">
                        {formatDateTime(candidate.lastVisit)}
                      </td>
                      <td className="py-3 pr-3 text-zinc-700">
                        <span className="block font-medium text-amber-800">
                          {formatDays(candidate.inactiveDays)}
                        </span>
                        <span className="block text-xs text-zinc-500">
                          {formatComebackCandidateReason(
                            candidate,
                            inactiveThresholdDays,
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState>
            No matching users for the current filters.
          </EmptyState>
        )}
      </div>
    </FormSection>
  )
}

function DeletePartnerForm({
  partner,
  onDeleted,
}: {
  partner: PartnerWithDeals
  onDeleted: () => void
}) {
  const [state, formAction] = useActionState(deletePartner, initialState)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deletePassword, setDeletePassword] = useState("")
  const [deletePasswordError, setDeletePasswordError] = useState("")
  const formRef = useRef<HTMLFormElement>(null)
  const confirmedSubmitRef = useRef(false)
  const { language } = useAdminLanguage()

  useEffect(() => {
    if (!state.ok) {
      return
    }

    onDeleted()
  }, [onDeleted, state.ok])

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(event) => {
        if (confirmedSubmitRef.current) {
          confirmedSubmitRef.current = false
          return
        }

        event.preventDefault()
        setConfirmingDelete(true)
      }}
      className="space-y-3"
    >
      <input type="hidden" name="id" value={partner.id ?? ""} />
      <input type="hidden" name="delete_password" value={deletePassword} />
      <ActionMessage state={state} />
      <SubmitButton
        label="Delete partner"
        pendingLabel="Deleting partner..."
        tone="danger"
      />
      <ConfirmDialog
        open={confirmingDelete}
        title="Delete partner?"
        description={
          language === "de"
            ? `${partner.name || "Dieser Partner"} und alle zugehörigen Deals werden dauerhaft gelöscht.`
            : `This will permanently delete ${partner.name || "this partner"} and all attached deals.`
        }
        confirmLabel="Delete partner"
        tone="danger"
        onCancel={() => {
          setConfirmingDelete(false)
          setDeletePassword("")
          setDeletePasswordError("")
        }}
        onConfirm={() => {
          if (!deletePassword.trim()) {
            setDeletePasswordError("Enter your admin password to continue.")
            return
          }

          confirmedSubmitRef.current = true
          setConfirmingDelete(false)
          formRef.current?.requestSubmit()
        }}
      >
        <label className="mt-4 block space-y-2 text-sm">
          <span className="font-medium text-zinc-800">Admin password</span>
          <input
            type="password"
            value={deletePassword}
            onChange={(event) => {
              setDeletePassword(event.target.value)
              if (deletePasswordError) setDeletePasswordError("")
            }}
            autoComplete="current-password"
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-rose-600 focus:ring-2 focus:ring-rose-100"
          />
          {deletePasswordError ? (
            <span className="block text-xs font-medium text-rose-700">
              {deletePasswordError}
            </span>
          ) : null}
        </label>
      </ConfirmDialog>
    </form>
  )
}

function DeleteDealForm({
  dealId,
  label = "Delete",
  onDeleted,
  pendingLabel = "Deleting deal...",
  size = "compact",
  tone = "danger",
}: {
  dealId: string
  label?: string
  onDeleted?: () => void
  pendingLabel?: string
  size?: "compact" | "tiny"
  tone?: "danger" | "outline"
}) {
  const [state, formAction] = useActionState(deleteDeal, initialState)
  const { language } = useAdminLanguage()

  useEffect(() => {
    if (state.ok) onDeleted?.()
  }, [onDeleted, state.ok])

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            language === "de" ? "Diesen Deal löschen?" : "Delete this deal?",
          )
        ) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="id" value={dealId} />
      <ActionMessage state={state} />
      <SubmitButton
        label={label}
        pendingLabel={pendingLabel}
        size={size}
        tone={tone}
      />
    </form>
  )
}

function DeleteMilestoneForm({
  milestoneId,
  onDeleted,
}: {
  milestoneId: string
  onDeleted?: () => void
}) {
  const [state, formAction] = useActionState(
    deleteRewardMilestone,
    initialState,
  )
  const { language } = useAdminLanguage()

  useEffect(() => {
    if (state.ok) onDeleted?.()
  }, [onDeleted, state.ok])

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            language === "de"
              ? "Diese Belohnungsstufe löschen?"
              : "Delete this milestone?",
          )
        ) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="id" value={milestoneId} />
      <ActionMessage state={state} />
      <SubmitButton
        label="Delete"
        pendingLabel="Deleting milestone..."
        size="compact"
        tone="danger"
      />
    </form>
  )
}

function DeletePartnerStaffForm({ staffId }: { staffId: string }) {
  const [state, formAction] = useActionState(deletePartnerStaff, initialState)
  const { language } = useAdminLanguage()

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            language === "de"
              ? "Diesen Mitarbeiterzugriff entfernen?"
              : "Remove this staff access?",
          )
        ) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="id" value={staffId} />
      <ActionMessage state={state} />
      <SubmitButton
        label="Remove"
        pendingLabel="Removing access..."
        size="compact"
        tone="danger"
      />
    </form>
  )
}

function FormSection({
  title,
  children,
  compact = false,
  collapsible = true,
  defaultOpen = true,
  required,
  status,
}: {
  title: string
  children: ReactNode
  compact?: boolean
  collapsible?: boolean
  defaultOpen?: boolean
  required?: boolean | "subtle"
  status?: SectionStatusValue
}) {
  const [open, setOpen] = useState(defaultOpen)
  const sectionStatus: SectionStatusValue | undefined = required
    ? required === "subtle"
      ? { label: "Required", tone: "required-subtle" as const }
      : { label: "Required", tone: "required" as const }
    : status

  return (
    <div
      className={`${open ? "overflow-visible" : "overflow-hidden"} rounded-xl border bg-white text-sm transition-shadow ${
        open ? "border-zinc-300 shadow-sm" : "border-zinc-200"
      }`}
    >
      {collapsible ? (
        <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
          <summary className="cursor-pointer list-none px-3 outline-none transition hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-200 [&::-webkit-details-marker]:hidden sm:px-4">
            <span className={`flex min-w-0 flex-wrap items-center gap-2 ${compact ? "min-h-10" : "min-h-11"}`}>
              <span className="min-w-0 break-words text-sm font-semibold tracking-normal text-zinc-900">
                {title}
              </span>
              {sectionStatus ? <SectionStatusList status={sectionStatus} /> : null}
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                className={`ml-auto size-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
              >
                <path
                  d="m5 7.5 5 5 5-5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </summary>
          <div
            className={`border-t border-zinc-200 bg-zinc-50/70 ${
              compact ? "space-y-2.5 p-3" : "space-y-3 p-3 sm:p-4"
            }`}
          >
            {children}
          </div>
        </details>
      ) : (
        <>
          <div className={`flex min-w-0 flex-wrap items-center gap-2 px-3 sm:px-4 ${compact ? "min-h-10" : "min-h-11"}`}>
            <span className="min-w-0 break-words text-sm font-semibold text-zinc-900">
              {title}
            </span>
            {sectionStatus ? <SectionStatusList status={sectionStatus} /> : null}
          </div>
          <div
            className={`border-t border-zinc-200 bg-zinc-50/70 ${
              compact ? "space-y-2.5 p-3" : "space-y-3 p-3 sm:p-4"
            }`}
          >
            {children}
          </div>
        </>
      )}
    </div>
  )
}

function SectionStatusBadge({ status }: { status: SectionStatus }) {
  const tone = status.tone ?? "info"
  if (tone === "required-subtle") {
    return (
      <span
        className="inline-grid size-5 place-items-center rounded-full text-sm font-semibold text-rose-500"
        aria-label="Required"
        title="Required"
      >
        *
      </span>
    )
  }

  const toneClasses =
    tone === "required"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "recommended"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-zinc-200 bg-zinc-50 text-zinc-600"

  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-xs font-semibold normal-case tracking-normal ${toneClasses}`}
    >
      {status.label}
    </span>
  )
}

function SectionStatusList({ status }: { status: SectionStatusValue }) {
  const statuses = Array.isArray(status) ? status : [status]

  return (
    <>
      {statuses.map((entry, index) => (
        <SectionStatusBadge
          key={`${entry.label}-${entry.tone ?? "info"}-${index}`}
          status={entry}
        />
      ))}
    </>
  )
}

function FieldGrid({
  children,
  compact = false,
}: {
  children: ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={`grid min-w-0 md:grid-cols-2 2xl:grid-cols-3 [&>*]:min-w-0 ${
        compact ? "gap-2.5" : "gap-3"
      }`}
    >
      {children}
    </div>
  )
}

function inferTextFieldMaxLength(name: string, type = "text") {
  const normalizedName = name.trim().toLowerCase()

  if (!normalizedName) {
    return undefined
  }

  if (type === "number" || type === "date" || type === "time") {
    return undefined
  }

  if (type === "email" || normalizedName.endsWith("email")) {
    return adminTextLimits.email
  }

  if (type === "tel" || normalizedName.endsWith("phone")) {
    return adminTextLimits.phone
  }

  if (type === "url" || normalizedName.includes("website") || normalizedName.endsWith("url")) {
    return adminTextLimits.mediumText
  }

  if (normalizedName.includes("coordinates")) {
    return adminTextLimits.coordinates
  }

  if (normalizedName.endsWith("address")) {
    return adminTextLimits.mediumText
  }

  if (normalizedName.endsWith("currency")) {
    return adminTextLimits.currency
  }

  if (normalizedName.endsWith("tags") || normalizedName.endsWith("allergens")) {
    return adminTextLimits.tagList
  }

  if (normalizedName.endsWith("handle")) {
    return adminTextLimits.socialHandle
  }

  if (normalizedName.endsWith("label")) {
    return adminTextLimits.label
  }

  if (
    normalizedName.endsWith("name") ||
    normalizedName.endsWith("title") ||
    normalizedName.endsWith("reward_item") ||
    normalizedName.endsWith("challenge_name") ||
    normalizedName.endsWith("slug")
  ) {
    return adminTextLimits.shortText
  }

  if (
    normalizedName.includes("description") ||
    normalizedName.includes("instructions") ||
    normalizedName.endsWith("terms")
  ) {
    return adminTextLimits.longText
  }

  if (normalizedName.includes("metadata")) {
    return adminTextLimits.metadata
  }

  return undefined
}

function measureCharacterCount(value: string | number | null | undefined) {
  return String(value ?? "").length
}

function CharacterCountNote({
  current,
  limit,
}: {
  current: number
  limit: number
}) {
  return (
    <span className="block text-right text-xs text-zinc-500">
      {current} / {limit} characters
    </span>
  )
}

function FieldSupportText({
  hint,
  warning,
  currentLength,
  maxLength,
}: {
  hint?: string
  warning?: string
  currentLength: number
  maxLength?: number
}) {
  if (!hint && !warning && typeof maxLength !== "number") {
    return null
  }

  return (
    <div className="space-y-1">
      {hint || typeof maxLength === "number" ? (
        <div
          className={`flex flex-wrap gap-2 text-xs ${
            hint ? "items-start justify-between" : "justify-end"
          }`}
        >
          {hint ? <span className="text-zinc-500">{hint}</span> : null}
          {typeof maxLength === "number" ? (
            <CharacterCountNote current={currentLength} limit={maxLength} />
          ) : null}
        </div>
      ) : null}
      {warning ? (
        <span className="block text-xs font-medium text-amber-700">
          {warning}
        </span>
      ) : null}
    </div>
  )
}

type TextFieldProps = {
  label: string
  name: string
  type?: string
  step?: string
  min?: string | number
  max?: string | number
  hint?: string
  prefixText?: string
  required?: boolean
  recommended?: boolean
  placeholder?: string
  suffixText?: string
  value?: string | number
  defaultValue?: string | number | null
  maxLength?: number
  warning?: string
  showCharacterCount?: boolean
  onChange?: (value: string) => void
}

function TextField({
  label,
  name,
  type = "text",
  step,
  min,
  max,
  hint,
  prefixText,
  required,
  recommended,
  placeholder,
  suffixText,
  value,
  defaultValue,
  maxLength,
  warning,
  showCharacterCount = true,
  onChange,
}: TextFieldProps) {
  const resolvedMaxLength =
    typeof maxLength === "number"
      ? maxLength
      : inferTextFieldMaxLength(name, type)
  const [uncontrolledLength, setUncontrolledLength] = useState(() =>
    measureCharacterCount(defaultValue),
  )
  const currentLength =
    value === undefined ? uncontrolledLength : measureCharacterCount(value)

  return (
    <label className="block min-w-0 space-y-1.5 text-sm">
      <FieldLabel label={label} required={required} recommended={recommended} />
      <div
        className={`flex h-9 w-full items-center rounded-lg border border-zinc-300 bg-white text-sm text-zinc-950 transition focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-100 ${
          prefixText || suffixText ? "overflow-hidden" : ""
        }`}
      >
        {prefixText ? (
          <span className="flex h-full items-center border-r border-zinc-200 bg-zinc-50 px-3 text-zinc-500">
            {prefixText}
          </span>
        ) : null}
        <input
          name={name}
          type={type}
          step={step}
          min={min}
          max={max}
          required={required}
          placeholder={placeholder}
          value={value}
          defaultValue={value === undefined ? defaultValue ?? "" : undefined}
          maxLength={resolvedMaxLength}
          onChange={(event) => {
            if (value === undefined) {
              setUncontrolledLength(event.target.value.length)
            }
            onChange?.(event.target.value)
          }}
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-zinc-950 outline-none"
        />
        {suffixText ? (
          <span className="flex h-full items-center border-l border-zinc-200 bg-zinc-50 px-3 text-zinc-500">
            {suffixText}
          </span>
        ) : null}
      </div>
      <FieldSupportText
        hint={hint}
        warning={warning}
        currentLength={currentLength}
        maxLength={showCharacterCount ? resolvedMaxLength : undefined}
      />
    </label>
  )
}

function SelectField({
  label,
  name,
  options,
  defaultValue,
  value,
  required,
  hint,
  onChange,
}: {
  label: string
  name: string
  options: readonly { value: string; label: string }[]
  defaultValue?: string | null
  value?: string
  required?: boolean
  hint?: string
  onChange?: (value: string) => void
}) {
  return (
    <label className="block min-w-0 space-y-1.5 text-sm">
      <FieldLabel label={label} required={required} />
      <select
        name={name}
        required={required}
        value={value}
        defaultValue={value === undefined ? defaultValue ?? "" : undefined}
        onChange={(event) => onChange?.(event.target.value)}
        className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
      >
        <option value="">Select...</option>
        {options
          .filter((option) => option.value)
          .map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
      </select>
      {hint ? <span className="block text-xs text-zinc-500">{hint}</span> : null}
    </label>
  )
}

function MultiSelectField({
  label,
  name,
  options,
  defaultValues,
  required,
  hint,
}: {
  label: string
  name: string
  options: readonly { value: string; label: string }[]
  defaultValues?: string[] | null
  required?: boolean
  hint?: string
}) {
  const [selectedValues, setSelectedValues] = useState(defaultValues ?? [])
  const [open, setOpen] = useState(false)
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const labelsByValue = new Map(options.map((option) => [option.value, option.label]))
  const selectedLabels = selectedValues.length
    ? selectedValues
        .map((value) => labelsByValue.get(value) ?? value)
        .join(", ")
    : "Select..."

  useEffect(() => {
    if (!open) {
      return
    }

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        detailsRef.current &&
        !detailsRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick)
    document.addEventListener("keydown", closeOnEscape)

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  return (
    <div className="min-w-0 space-y-1.5 text-sm">
      <FieldLabel label={label} required={required} />
      <details
        ref={detailsRef}
        className="relative"
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary
          className="flex min-h-9 cursor-pointer list-none items-center rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          onClick={(event) => {
            event.preventDefault()
            setOpen((value) => !value)
          }}
        >
          <span className="line-clamp-2">{selectedLabels}</span>
        </summary>
        <div
          className="absolute z-20 mt-2 grid max-h-72 w-full gap-1 overflow-y-auto rounded-md border border-zinc-200 bg-white p-2 shadow-lg"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false)
            }
          }}
        >
          {options.map((option) => {
            const checked = selectedValues.includes(option.value)

            return (
              <label
                key={option.value}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                <input
                  type="checkbox"
                  name={name}
                  value={option.value}
                  checked={checked}
                  onChange={(event) => {
                    setSelectedValues((current) =>
                      event.target.checked
                        ? [...current, option.value]
                        : current.filter((value) => value !== option.value),
                    )
                  }}
                  className="size-4 rounded border-zinc-300 accent-teal-700"
                />
                {option.label}
              </label>
            )
          })}
        </div>
      </details>
      {hint ? <span className="block text-xs text-zinc-500">{hint}</span> : null}
    </div>
  )
}

function WeekdayChipField({
  label,
  name,
  defaultValues,
  hint,
}: {
  label: string
  name: string
  defaultValues?: Array<number | string> | null
  hint?: string
}) {
  const [selectedValues, setSelectedValues] = useState(() =>
    normalizeWeekdayNumbers(defaultValues),
  )

  return (
    <fieldset className="space-y-2 text-sm md:col-span-2 2xl:col-span-3">
      <legend>
        <FieldLabel label={label} />
      </legend>
      <input type="hidden" name={`${name}_present`} value="1" />
      <div className="flex flex-wrap gap-1.5">
        {[
          { label: "All days", values: [1, 2, 3, 4, 5, 6, 7] },
          { label: "Weekdays", values: [1, 2, 3, 4, 5] },
          { label: "Weekend", values: [6, 7] },
          { label: "Clear", values: [] },
        ].map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => setSelectedValues(action.values)}
            className="h-7 rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 transition hover:border-teal-400 hover:bg-teal-50"
          >
            {action.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7 md:grid-cols-4 2xl:grid-cols-7">
        {dealDropWeekdayOptions.map((option) => {
          const checked = selectedValues.includes(option.value)

          return (
            <label key={option.value} className="block">
              <input
                type="checkbox"
                name={name}
                value={option.value}
                checked={checked}
                onChange={(event) => {
                  setSelectedValues((current) =>
                    event.target.checked
                      ? [...current, option.value].sort((first, second) => first - second)
                      : current.filter((value) => value !== option.value),
                  )
                }}
                aria-label={option.fullLabel}
                className="peer sr-only"
              />
              <span
                className={`flex h-10 cursor-pointer items-center justify-center rounded-md border px-2 text-sm font-semibold transition peer-focus-visible:ring-2 peer-focus-visible:ring-teal-100 ${
                  checked
                    ? "border-teal-700 bg-teal-700 text-white"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-teal-400 hover:bg-teal-50"
                }`}
              >
                {option.label}
              </span>
            </label>
          )
        })}
      </div>
      {hint ? <span className="block text-xs text-zinc-500">{hint}</span> : null}
    </fieldset>
  )
}

function AdvancedSettingsSection({ children }: { children: ReactNode }) {
  return (
    <FormSection title="Advanced settings" defaultOpen={false} compact>
      <p className="text-sm leading-6 text-zinc-600">
        Optional advanced configuration for developers and experimental features.
      </p>
      {children}
    </FormSection>
  )
}

function MediaUploadField({
  label,
  fileName,
  existingName,
  removeName,
  currentUrl,
  spec,
  compact = false,
  dense = false,
  inputId,
  onPreviewChange,
}: {
  label: string
  fileName: string
  existingName: string
  removeName: string
  currentUrl?: string | null
  spec: PartnerMediaSpec
  compact?: boolean
  dense?: boolean
  inputId?: string
  onPreviewChange?: (url: string) => void
}) {
  const [removed, setRemoved] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [sourceFiles, setSourceFiles] = useState<File[]>([])
  const [selectedPreviews, setSelectedPreviews] = useState<ImagePreview[]>([])
  const [uploadMessage, setUploadMessage] = useState("")
  const [uploadError, setUploadError] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [cropZoom, setCropZoom] = useState(1)
  const [cropX, setCropX] = useState(0)
  const [cropY, setCropY] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedPreviewsRef = useRef<ImagePreview[]>([])
  const hasSelectedPreviews = selectedPreviews.length > 0
  const selectedPreview = selectedPreviews[0]
  const showCurrent = Boolean(currentUrl) && !removed && !hasSelectedPreviews
  const sizeHint = mediaSizeHint(spec)

  useEffect(() => {
    selectedPreviewsRef.current = selectedPreviews
  }, [selectedPreviews])

  useEffect(() => () => revokeImagePreviews(selectedPreviewsRef.current), [])

  const clearSelectedMedia = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }

    setSelectedFiles([])
    setSourceFiles([])
    setSelectedPreviews((current) => {
      revokeImagePreviews(current)
      return []
    })
    onPreviewChange?.("")
    setUploadMessage("")
  }

  const replaceSelectedMedia = (files: File[], previews: ImagePreview[]) => {
    setSelectedFiles(files)
    setSelectedPreviews((current) => {
      revokeImagePreviews(current)
      return previews
    })
  }

  const applyCrop = async (zoom: number, x: number, y: number) => {
    if (!sourceFiles.length || !fileInputRef.current) return
    setIsProcessing(true)
    setUploadError("")
    setUploadMessage("Applying crop...")
    try {
      const resizedFiles = await resizeImageFiles(sourceFiles, spec, { zoom, x, y })
      const previews = createImagePreviews(resizedFiles)
      replaceFileInputFiles(fileInputRef.current, resizedFiles)
      replaceSelectedMedia(resizedFiles, previews)
      onPreviewChange?.(previews[0]?.url ?? "")
      setUploadMessage(`Ready to upload at ${spec.width}px x ${spec.height}px.`)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Unable to apply this crop.")
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div aria-busy={isProcessing} className={`flex h-full flex-col rounded-xl border border-zinc-200 bg-white text-sm shadow-sm ${dense ? "gap-1.5 p-2.5" : "gap-2 p-3"}`}>
      <div className={dense ? "flex items-center justify-between gap-3" : "space-y-1"}>
        <p className="font-semibold text-zinc-800">{label}</p>
        <p className="text-xs text-zinc-500">
          {sizeHint} · Max 10 MB
        </p>
      </div>
      {currentUrl && !removed ? (
        <input type="hidden" name={existingName} value={currentUrl} />
      ) : null}
      <div
        className={`relative flex items-center justify-center rounded-md bg-zinc-50/60 ${
          dense ? "min-h-[5.25rem] p-1" : compact ? "min-h-[7rem] p-2" : "min-h-[9rem] p-2"
        }`}
      >
        {selectedPreview ? (
          <ImagePreview
            alt={selectedPreview.name}
            src={selectedPreview.url}
            spec={spec}
            maxWidth={dense ? 150 : undefined}
            selected
            onActivate={() => fileInputRef.current?.click()}
            onRemove={clearSelectedMedia}
            removeLabel={`Remove ${label}`}
          />
        ) : showCurrent ? (
          <ImagePreview
            alt={`${label} preview`}
            src={currentUrl ?? ""}
            spec={spec}
            maxWidth={dense ? 150 : undefined}
            onActivate={() => fileInputRef.current?.click()}
            onRemove={() => setRemoved(true)}
            removeLabel={`Remove ${label}`}
          />
        ) : (
          <ImagePreview
            alt={`${label} upload placeholder`}
            spec={spec}
            maxWidth={dense ? 150 : undefined}
            onActivate={() => fileInputRef.current?.click()}
          />
        )}
        {isProcessing ? (
          <div role="status" className="absolute inset-2 z-10 grid place-items-center rounded-md bg-white/85 text-teal-800 backdrop-blur-sm">
            <span className="inline-flex items-center gap-2 text-xs font-semibold">
              <LoadingSpinner /> Preparing image…
            </span>
          </div>
        ) : null}
      </div>
      {!dense ? (
        <p className="text-center text-[11px] font-medium text-zinc-500">
          Click the image to upload or replace it.
        </p>
      ) : null}
      <div className={dense ? "min-h-0" : "min-h-9"}>
        {selectedPreview ? (
          <p className="truncate text-xs font-medium text-zinc-600">
            {selectedPreview.name}
          </p>
        ) : null}
        {removed && currentUrl ? (
          <>
            <input type="hidden" name={removeName} value="on" />
            <input type="hidden" name="removed_media_urls" value={currentUrl} />
            <button
              type="button"
              onClick={() => setRemoved(false)}
              className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
            >
              Restore
            </button>
          </>
        ) : null}
      </div>
      {selectedPreview ? (
        <div className="grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 sm:grid-cols-3">
          {[
            { label: "Zoom", value: cropZoom, min: 1, max: 3, step: 0.05, key: "zoom" },
            { label: "Horizontal crop", value: cropX, min: -100, max: 100, step: 1, key: "x" },
            { label: "Vertical crop", value: cropY, min: -100, max: 100, step: 1, key: "y" },
          ].map((control) => (
            <label key={control.key} className="space-y-1 text-[11px] font-semibold text-zinc-600">
              <span>{control.label}</span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={control.value}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  const zoom = control.key === "zoom" ? value : cropZoom
                  const x = control.key === "x" ? value : cropX
                  const y = control.key === "y" ? value : cropY
                  setCropZoom(zoom)
                  setCropX(x)
                  setCropY(y)
                  void applyCrop(zoom, x, y)
                }}
                className="block w-full accent-teal-700"
              />
            </label>
          ))}
        </div>
      ) : null}
      <div className="mt-auto space-y-2">
        <input
          ref={fileInputRef}
          id={inputId}
          name={fileName}
          type="file"
          accept={partnerMediaAccept}
          disabled={isProcessing}
          onChange={async (event) => {
            const input = event.currentTarget
            const files = Array.from(input.files ?? [])

            if (files.length === 0) {
              replaceFileInputFiles(input, selectedFiles)
              return
            }

            setUploadError("")
            setUploadMessage("Resizing image...")
            setIsProcessing(true)

            try {
              setSourceFiles(files)
              setCropZoom(1)
              setCropX(0)
              setCropY(0)
              const resizedFiles = await resizeImageFiles(files, spec, { zoom: 1, x: 0, y: 0 })
              const previews = createImagePreviews(resizedFiles)
              replaceFileInputFiles(input, resizedFiles)
              replaceSelectedMedia(resizedFiles, previews)
              onPreviewChange?.(previews[0]?.url ?? "")
              setUploadMessage(
                `Ready to upload at ${spec.width}px x ${spec.height}px.`,
              )
            } catch (error) {
              input.value = ""
              setSelectedFiles([])
              setSelectedPreviews((current) => {
                revokeImagePreviews(current)
                return []
              })
              onPreviewChange?.("")
              setUploadMessage("")
              setUploadError(
                error instanceof Error
                  ? error.message
                  : "Unable to prepare this image.",
              )
            } finally {
              setIsProcessing(false)
            }
          }}
          className="sr-only"
        />
        {uploadMessage ? (
          <p className="text-xs font-medium text-emerald-700">
            {uploadMessage}
          </p>
        ) : null}
        {uploadError ? (
          <p className="text-xs font-medium text-rose-700">{uploadError}</p>
        ) : null}
      </div>
    </div>
  )
}

function CoverUploadField({
  covers,
  partnerId,
}: {
  covers?: string[] | null
  partnerId?: string
}) {
  const savedCovers = normalizeMediaUrls(covers)
  const [removedUrls, setRemovedUrls] = useState<string[]>([])
  const [selectedCovers, setSelectedCovers] = useState<
    Array<{ id: string; preview: ImagePreview; url: string }>
  >([])
  const [discardedUploadedUrls, setDiscardedUploadedUrls] = useState<string[]>([])
  const [coverOrder, setCoverOrder] = useState(() =>
    savedCovers.map((_, index) => `existing:${index}`),
  )
  const [draggedCoverId, setDraggedCoverId] = useState("")
  const [uploadMessage, setUploadMessage] = useState("")
  const [uploadError, setUploadError] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replacementTargetRef = useRef("")
  const selectedPreviewsRef = useRef<ImagePreview[]>([])
  const visibleCovers = savedCovers.filter(
    (coverUrl) => !removedUrls.includes(coverUrl),
  )
  const removedCovers = savedCovers.filter((coverUrl) =>
    removedUrls.includes(coverUrl),
  )
  const spec = partnerMediaSpecs.cover
  const sizeHint = mediaSizeHint(spec)
  const remainingCoverSlots = Math.max(maxCoverPhotos - visibleCovers.length - selectedCovers.length, 0)
  const existingFormIndex = new Map(
    savedCovers
      .map((url, originalIndex) => ({ originalIndex, url }))
      .filter(({ url }) => !removedUrls.includes(url))
      .map(({ originalIndex }, formIndex) => [originalIndex, formIndex]),
  )
  const orderedCoverIds = coverOrder.filter((id) => {
    const [kind, value] = id.split(":")
    return kind === "existing"
      ? existingFormIndex.has(Number(value))
      : selectedCovers.some((cover) => cover.id === value)
  })

  useEffect(() => {
    selectedPreviewsRef.current = selectedCovers.map((cover) => cover.preview)
  }, [selectedCovers])

  useEffect(() => () => revokeImagePreviews(selectedPreviewsRef.current), [])

  const syncFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removeSelectedCover = (id: string) => {
    const removed = selectedCovers.find((cover) => cover.id === id)
    const nextCovers = selectedCovers.filter((cover) => cover.id !== id)
    if (removed) {
      revokeImagePreviews([removed.preview])
      setDiscardedUploadedUrls((current) => [...current, removed.url])
    }
    setSelectedCovers(nextCovers)
    setCoverOrder((current) => current.filter((coverId) => coverId !== `selected:${id}`))
    syncFileInput()
    if (nextCovers.length === 0) {
      setUploadMessage("")
    }
  }

  const moveCover = (targetId: string) => {
    if (draggedCoverId && draggedCoverId !== targetId) {
      setCoverOrder((current) => moveIdBeforeTarget(current, draggedCoverId, targetId))
    }
    setDraggedCoverId("")
  }

  const moveCoverBy = (id: string, offset: number) => {
    setCoverOrder((current) => {
      const fromIndex = current.indexOf(id)
      const toIndex = fromIndex + offset

      if (fromIndex < 0 || toIndex < 0 || toIndex >= current.length) return current

      const next = [...current]
      ;[next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]]
      return next
    })
  }

  const chooseReplacement = (id: string) => {
    replacementTargetRef.current = id
    fileInputRef.current?.click()
  }

  const uploadCover = async (file: File) => {
    const target = await createPartnerCoverUpload(
      file.name,
      file.type,
      file.size,
      partnerId,
    )

    if (!target.ok) throw new Error(target.message)

    const supabase = createBrowserClient()
    const { error } = await supabase.storage
      .from(target.bucket)
      .uploadToSignedUrl(target.path, target.token, file, {
        cacheControl: "31536000",
        contentType: file.type,
      })

    if (error) throw new Error(`Unable to upload "${file.name}": ${error.message}`)

    return {
      id: crypto.randomUUID(),
      preview: { name: file.name, url: target.publicUrl },
      url: target.publicUrl,
    }
  }

  return (
    <div aria-busy={isProcessing} className="space-y-3 border-t border-zinc-200 pt-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-zinc-800">Cover photos</p>
        <span className="text-xs font-medium text-zinc-500">Drag previews to rearrange</span>
      </div>
      <p className="text-xs text-zinc-500">
        {sizeHint}. Images are resized automatically before upload. Max{" "}
        {maxCoverPhotos} cover photos, 10 MB each.
      </p>
      <p className="text-xs font-medium text-zinc-500">
        {visibleCovers.length} of {maxCoverPhotos} cover photos saved
        {remainingCoverSlots ? `; ${remainingCoverSlots} slot${remainingCoverSlots === 1 ? "" : "s"} available.` : "."}
      </p>
      {visibleCovers.map((coverUrl) => (
        <input key={coverUrl} type="hidden" name="existing_cover_urls" value={coverUrl} />
      ))}
      {selectedCovers.map((cover) => (
        <input key={cover.id} type="hidden" name="existing_cover_urls" value={cover.url} />
      ))}
      {discardedUploadedUrls.map((coverUrl) => (
        <input
          key={`discarded-${coverUrl}`}
          type="hidden"
          name="removed_media_urls"
          value={coverUrl}
        />
      ))}
      {orderedCoverIds.map((id) => {
        const [kind, value] = id.split(":")
        const token = kind === "existing"
          ? `existing:${existingFormIndex.get(Number(value))}`
          : `existing:${visibleCovers.length + selectedCovers.findIndex((cover) => cover.id === value)}`
        return <input key={`order-${id}`} type="hidden" name="cover_order" value={token} />
      })}
      {orderedCoverIds.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {orderedCoverIds.map((id, index) => {
            const [kind, value] = id.split(":")
            const coverUrl = kind === "existing" ? savedCovers[Number(value)] : ""
            const selected = kind === "selected"
              ? selectedCovers.find((cover) => cover.id === value)
              : undefined
            return (
              <div
                key={id}
                data-cover-id={id}
                draggable
                onDragStart={() => setDraggedCoverId(id)}
                onDragEnd={() => setDraggedCoverId("")}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => moveCover(id)}
                onPointerDown={(event) => {
                  if ((event.target as HTMLElement).closest("button, [role='button']")) return
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setDraggedCoverId(id)
                }}
                onPointerMove={(event) => {
                  if (!draggedCoverId) return
                  const targetId = document
                    .elementFromPoint(event.clientX, event.clientY)
                    ?.closest<HTMLElement>("[data-cover-id]")
                    ?.dataset.coverId

                  if (targetId && targetId !== draggedCoverId) {
                    setCoverOrder((current) => {
                      const fromIndex = current.indexOf(draggedCoverId)
                      const targetIndex = current.indexOf(targetId)

                      if (fromIndex < 0 || targetIndex < 0) return current

                      const next = [...current]
                      next.splice(fromIndex, 1)
                      next.splice(targetIndex, 0, draggedCoverId)
                      return next
                    })
                  }
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId)
                  }
                  setDraggedCoverId("")
                }}
                onPointerCancel={() => setDraggedCoverId("")}
                className={`space-y-2 rounded-md p-1 transition touch-none ${draggedCoverId === id ? "opacity-50" : "cursor-grab"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-500">{index + 1}</span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveCoverBy(id, -1)}
                      aria-label="Move cover photo earlier"
                      className="size-8 rounded border border-zinc-300 bg-white text-zinc-700 disabled:opacity-40"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      disabled={index === orderedCoverIds.length - 1}
                      onClick={() => moveCoverBy(id, 1)}
                      aria-label="Move cover photo later"
                      className="size-8 rounded border border-zinc-300 bg-white text-zinc-700 disabled:opacity-40"
                    >
                      →
                    </button>
                  </span>
                </div>
                <ImagePreview
                  alt={selected?.preview.name || "Cover photo preview"}
                  src={selected?.preview.url || coverUrl}
                  spec={spec}
                  selected={Boolean(selected)}
                  onActivate={() => chooseReplacement(id)}
                  onRemove={() => {
                    if (selected) {
                      removeSelectedCover(selected.id)
                    } else {
                      setRemovedUrls((current) => [...current, coverUrl])
                      setCoverOrder((current) => current.filter((coverId) => coverId !== id))
                    }
                  }}
                  removeLabel="Remove cover photo"
                />
              </div>
            )
          })}
        </div>
      ) : (
        <ImagePreview
          alt="Cover photo upload placeholder"
          spec={spec}
          onActivate={() => chooseReplacement("")}
        />
      )}
      {removedCovers.length ? (
        <div className="flex flex-wrap gap-2">
          {removedCovers.map((coverUrl) => (
            <div key={coverUrl}>
              <input
                type="hidden"
                name="removed_media_urls"
                value={coverUrl}
              />
              <button
                type="button"
                onClick={() =>
                  {
                    setRemovedUrls((current) => current.filter((url) => url !== coverUrl))
                    const originalIndex = savedCovers.indexOf(coverUrl)
                    setCoverOrder((current) => [
                      ...current,
                      `existing:${originalIndex}`,
                    ])
                  }
                }
                className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
              >
                Restore cover
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isProcessing || remainingCoverSlots === 0}
          onClick={() => chooseReplacement("")}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span aria-hidden="true">+</span>
          Add cover photos
        </button>
        <span className="text-xs text-zinc-500">Click any preview to replace it.</span>
      </div>
      <input
        ref={fileInputRef}
        name="cover_files"
        type="file"
        accept={partnerMediaAccept}
        multiple
        disabled={isProcessing}
        onChange={async (event) => {
          const input = event.currentTarget
          const files = Array.from(input.files ?? [])
          const replacementTarget = replacementTargetRef.current
          replacementTargetRef.current = ""

          if (files.length === 0) {
            syncFileInput()
            return
          }

          setUploadError("")
          setUploadMessage("Resizing cover photos...")

          if (replacementTarget && files.length !== 1) {
            syncFileInput()
            setUploadMessage("")
            setUploadError("Select one image to replace this cover photo.")
            return
          }

          if (!replacementTarget && files.length > remainingCoverSlots) {
            syncFileInput()
            setUploadMessage("")
            setUploadError(
              `Select up to ${remainingCoverSlots} more cover photo${remainingCoverSlots === 1 ? "" : "s"}.`,
            )
            return
          }

          try {
            setIsProcessing(true)
            const resizedFiles = await resizeImageFiles(files, spec)
            const additions: Awaited<ReturnType<typeof uploadCover>>[] = []

            for (const file of resizedFiles) {
              additions.push(await uploadCover(file))
            }
            const replacement = additions[0]
            let nextCovers: typeof selectedCovers

            if (replacementTarget && replacement) {
              const [targetKind, targetValue] = replacementTarget.split(":")

              if (targetKind === "existing") {
                const replacedUrl = savedCovers[Number(targetValue)]
                if (replacedUrl) {
                  setRemovedUrls((current) =>
                    current.includes(replacedUrl) ? current : [...current, replacedUrl],
                  )
                }
                nextCovers = [...selectedCovers, replacement]
              } else {
                const replacedCover = selectedCovers.find(
                  (cover) => cover.id === targetValue,
                )
                if (replacedCover) {
                  revokeImagePreviews([replacedCover.preview])
                  setDiscardedUploadedUrls((current) => [
                    ...current,
                    replacedCover.url,
                  ])
                }
                nextCovers = [
                  ...selectedCovers.filter((cover) => cover.id !== targetValue),
                  replacement,
                ]
              }

              setSelectedCovers(nextCovers)
              setCoverOrder((current) =>
                current.map((id) =>
                  id === replacementTarget ? `selected:${replacement.id}` : id,
                ),
              )
            } else {
              nextCovers = [...selectedCovers, ...additions]
              setSelectedCovers(nextCovers)
              setCoverOrder((current) => [
                ...current,
                ...additions.map((cover) => `selected:${cover.id}`),
              ])
            }
            input.value = ""
            setUploadMessage(
              replacementTarget
                ? "Cover photo replaced and ready."
                : `${nextCovers.length} new cover photo${nextCovers.length === 1 ? "" : "s"} uploaded and ready.`,
            )
          } catch (error) {
            syncFileInput()
            setUploadMessage("")
            setUploadError(
              error instanceof Error
                ? error.message
                : "Unable to prepare these cover photos.",
            )
          } finally {
            setIsProcessing(false)
          }
        }}
        className="sr-only"
      />
      {isProcessing ? (
        <p role="status" className="inline-flex items-center gap-2 text-xs font-semibold text-teal-700">
          <LoadingSpinner className="size-3" /> Preparing cover images…
        </p>
      ) : null}
      {uploadMessage ? (
        <p className="text-xs font-medium text-emerald-700">{uploadMessage}</p>
      ) : null}
      {uploadError ? (
        <p className="text-xs font-medium text-rose-700">{uploadError}</p>
      ) : null}
    </div>
  )
}

type ImagePreview = {
  name: string
  url: string
}

function ImagePreview({
  alt,
  onActivate,
  onRemove,
  removeLabel,
  src,
  spec,
  selected = false,
  maxWidth,
}: {
  alt: string
  onActivate?: () => void
  onRemove?: () => void
  removeLabel?: string
  src?: string
  spec: PartnerMediaSpec
  selected?: boolean
  maxWidth?: number
}) {
  return (
    <div
      role={onActivate ? "button" : undefined}
      tabIndex={onActivate ? 0 : undefined}
      title={onActivate ? "Click to choose a different image" : undefined}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (onActivate && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault()
          onActivate()
        }
      }}
      className={`relative overflow-hidden ${spec.label === "Logo" ? "rounded-full" : "rounded-md"} border ${
        selected ? "border-teal-200 bg-white" : "border-zinc-200 bg-white"
      } ${onActivate ? "cursor-pointer outline-none transition hover:border-teal-400 hover:ring-2 hover:ring-teal-100 focus-visible:ring-2 focus-visible:ring-teal-300" : ""}`}
      style={{
        aspectRatio: `${spec.previewAspectWidth ?? spec.width} / ${
          spec.previewAspectHeight ?? spec.height
        }`,
        height: "auto",
        maxWidth: `${maxWidth ?? spec.previewMaxWidth}px`,
        width: "100%",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={alt}
        src={src ?? uploadPlaceholderSrc}
        onError={(event) => {
          if (event.currentTarget.dataset.fallbackApplied) {
            return
          }

          event.currentTarget.dataset.fallbackApplied = "true"
          event.currentTarget.src = uploadPlaceholderSrc
        }}
        className={`size-full ${
          src
            ? spec.previewFit === "cover"
              ? "object-cover"
              : "object-contain"
            : "object-contain p-3"
        }`}
      />
      {onRemove ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          aria-label={removeLabel ?? "Remove image"}
          className="absolute right-2 top-2 grid size-7 place-items-center rounded-full border border-white/80 bg-zinc-950/75 text-xs font-bold leading-none text-white shadow-sm transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-100"
        >
          x
        </button>
      ) : null}
    </div>
  )
}

function ThumbnailPreview({ alt, src }: { alt: string; src?: string }) {
  return (
    <span className="block size-14 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={alt}
        src={src || uploadPlaceholderSrc}
        className={`size-full ${src ? "object-cover" : "object-contain p-2"}`}
      />
    </span>
  )
}

function normalizeMediaUrls(urls?: string[] | null) {
  return (urls ?? [])
    .map((url) => url.trim())
    .filter((url) => url && !isUploadPlaceholderUrl(url))
}

function normalizePartnerCategories(categories?: string[] | null) {
  return categories?.map((category) => category === "Doner" ? "Döner" : category) ?? []
}

function isUploadPlaceholderUrl(url: string) {
  try {
    return new URL(url, "https://benefitsi.local").pathname === uploadPlaceholderSrc
  } catch {
    return url === uploadPlaceholderSrc || url === "upload-image.jpg"
  }
}

function createImagePreviews(files: File[]) {
  return files.map((file) => ({
    name: file.name,
    url: URL.createObjectURL(file),
  }))
}

function revokeImagePreviews(previews: ImagePreview[]) {
  previews.forEach((preview) => URL.revokeObjectURL(preview.url))
}

function mediaSizeHint(spec: PartnerMediaSpec) {
  const shape =
    spec.label === "Menu category"
      ? " · 2.38:1 landscape"
      : spec.label === "Menu item"
        ? " · 1:1 square"
        : ""
  return `${spec.label} size: ${spec.width}px × ${spec.height}px${shape}`
}

type ImageCrop = { zoom: number; x: number; y: number }

async function resizeImageFiles(
  files: File[],
  spec: PartnerMediaSpec,
  crop: ImageCrop = { zoom: 1, x: 0, y: 0 },
) {
  const resizedFiles: File[] = []

  for (const file of files) {
    resizedFiles.push(await resizeImageFile(file, spec, crop))
  }

  return resizedFiles
}

async function resizeImageFile(file: File, spec: PartnerMediaSpec, crop: ImageCrop) {
  if (!isSupportedImageFile(file)) {
    throw new Error(`"${file.name}" must be a PNG, JPEG, WebP, or SVG image.`)
  }

  const image = await loadImage(file)
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height

  if (!sourceWidth || !sourceHeight) {
    throw new Error(`Unable to read the dimensions for "${file.name}".`)
  }

  if (sourceWidth === spec.width && sourceHeight === spec.height && crop.zoom === 1 && crop.x === 0 && crop.y === 0) {
    return file
  }

  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("Image resizing is not supported in this browser.")
  }

  canvas.width = spec.width
  canvas.height = spec.height

  const sourceRatio = sourceWidth / sourceHeight
  const targetRatio = spec.width / spec.height
  let drawWidth = sourceWidth
  let drawHeight = sourceHeight
  let drawX = 0
  let drawY = 0

  if (sourceRatio > targetRatio) {
    drawWidth = sourceHeight * targetRatio
    drawX = (sourceWidth - drawWidth) / 2
  } else {
    drawHeight = sourceWidth / targetRatio
    drawY = (sourceHeight - drawHeight) / 2
  }

  drawWidth /= crop.zoom
  drawHeight /= crop.zoom
  drawX = ((sourceWidth - drawWidth) * (Math.max(-100, Math.min(100, crop.x)) + 100)) / 200
  drawY = ((sourceHeight - drawHeight) * (Math.max(-100, Math.min(100, crop.y)) + 100)) / 200

  context.drawImage(
    image,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
    0,
    0,
    spec.width,
    spec.height,
  )

  const contentType = resizedImageType(file)
  const blob = await canvasToBlob(canvas, contentType)
  const extension = contentType === "image/jpeg" ? "jpg" : "png"
  const resizedName = replaceFileExtension(
    file.name,
    `${spec.width}x${spec.height}.${extension}`,
  )

  return new File([blob], resizedName, {
    type: contentType,
    lastModified: Date.now(),
  })
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Unable to load "${file.name}" for resizing.`))
    }
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, contentType: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error("Unable to resize the selected image."))
        }
      },
      contentType,
      0.92,
    )
  })
}

function resizedImageType(file: File) {
  return file.type === "image/jpeg" ? "image/jpeg" : "image/png"
}

function isSupportedImageFile(file: File) {
  if (
    file.type === "image/png" ||
    file.type === "image/jpeg" ||
    file.type === "image/webp" ||
    file.type === "image/svg+xml"
  ) {
    return true
  }

  if (file.type) {
    return false
  }

  return ["png", "jpg", "jpeg", "webp", "svg"].includes(
    file.name.split(".").pop()?.toLowerCase() ?? "",
  )
}

function replaceFileExtension(fileName: string, suffix: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "")

  return `${baseName}-${suffix}`
}

function replaceFileInputFiles(input: HTMLInputElement, files: File[]) {
  const transfer = new DataTransfer()

  files.forEach((file) => transfer.items.add(file))
  input.files = transfer.files
}

function ReadOnlyField({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number | null
  hint?: string
}) {
  return (
    <div className="block space-y-2 text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      <div className="flex h-10 items-center rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-700">
        {value ?? "Not set"}
      </div>
      {hint ? <span className="block text-xs text-zinc-500">{hint}</span> : null}
    </div>
  )
}

function PartnerPinDisplay({
  mode,
  partnerId,
  pin,
}: {
  mode: "create" | "edit"
  partnerId?: string | null
  pin?: number | string | null
}) {
  const [state, formAction] = useActionState(rotatePartnerPin, initialState)
  const [confirmingRotation, setConfirmingRotation] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const confirmedRotationRef = useRef(false)
  const router = useRouter()
  const generatedPin = partnerId ? derivePartnerPin(partnerId) : null
  const displayedPin =
    mode === "edit" ? state.partnerPin ?? pin ?? generatedPin : null

  useEffect(() => {
    if (state.ok) {
      router.refresh()
    }
  }, [router, state.ok])

  return (
    <div className="space-y-2">
      <ReadOnlyField
        label="Partner PIN"
        value={
          mode === "edit"
            ? displayedPin
            : "Generated automatically on creation"
        }
        hint={
          mode === "edit"
            ? "Automatically generated from the permanent partner record. Rotate it here when the partner needs a new PIN."
            : "Auto-generated when the partner is created and kept read-only here."
        }
      />
      {mode === "edit" && partnerId ? (
        <>
          <form
            ref={formRef}
            action={formAction}
            onSubmit={(event) => {
              if (confirmedRotationRef.current) {
                confirmedRotationRef.current = false
                return
              }

              event.preventDefault()
              setConfirmingRotation(true)
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="id" value={partnerId} />
            <ActionMessage state={state} />
            <SubmitButton
              label="Rotate partner PIN"
              pendingLabel="Rotating partner PIN..."
              size="compact"
              tone="outline"
            />
          </form>
          <ConfirmDialog
            open={confirmingRotation}
            title="Rotate partner PIN?"
            description="The current PIN will stop working and a new PIN will be generated for this partner."
            confirmLabel="Rotate PIN"
            onCancel={() => setConfirmingRotation(false)}
            onConfirm={() => {
              confirmedRotationRef.current = true
              setConfirmingRotation(false)
              formRef.current?.requestSubmit()
            }}
          />
        </>
      ) : null}
    </div>
  )
}

function derivePartnerPin(partnerId: string) {
  let hash = 2166136261

  for (let index = 0; index < partnerId.length; index += 1) {
    hash ^= partnerId.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return 1000 + ((hash >>> 0) % 9000)
}

function TextAreaField({
  label,
  name,
  defaultValue,
  value,
  required,
  hint,
  placeholder,
  maxLength,
  showCharacterCount = true,
  onChange,
  labelAccessory,
}: {
  label: string
  name: string
  defaultValue?: string | null
  value?: string
  required?: boolean
  hint?: string
  placeholder?: string
  maxLength?: number
  showCharacterCount?: boolean
  onChange?: (value: string) => void
  labelAccessory?: ReactNode
}) {
  const generatedId = useId()
  const inputId = `text-area-${generatedId.replace(/:/g, "")}`
  const resolvedMaxLength =
    typeof maxLength === "number" ? maxLength : inferTextFieldMaxLength(name)
  const [uncontrolledLength, setUncontrolledLength] = useState(() =>
    measureCharacterCount(defaultValue),
  )
  const currentLength =
    value === undefined ? uncontrolledLength : measureCharacterCount(value)

  return (
    <div className="block min-w-0 space-y-1.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={inputId}>
          <FieldLabel label={label} required={required} />
        </label>
        {labelAccessory}
      </div>
      <textarea
        id={inputId}
        name={name}
        rows={3}
        required={required}
        placeholder={placeholder}
        value={value}
        defaultValue={value === undefined ? defaultValue ?? "" : undefined}
        maxLength={resolvedMaxLength}
        onChange={(event) => {
          if (value === undefined) {
            setUncontrolledLength(event.target.value.length)
          }
          onChange?.(event.target.value)
        }}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
      />
      <FieldSupportText
        hint={hint}
        currentLength={currentLength}
        maxLength={showCharacterCount ? resolvedMaxLength : undefined}
      />
    </div>
  )
}

function FieldLabel({
  label,
  required,
  recommended,
}: {
  label: string
  required?: boolean
  recommended?: boolean
}) {
  return (
    <span className="font-medium text-zinc-700">
      {label}
      {required ? (
        <span className="ml-1 text-rose-600" aria-label="required">
          *
        </span>
      ) : null}
      {recommended && !required ? (
        <span className="ml-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold normal-case tracking-normal text-amber-800">
          Recommended
        </span>
      ) : null}
    </span>
  )
}

function CheckboxField({
  label,
  name,
  defaultChecked,
  checked,
  hint,
  onChange,
}: {
  label: string
  name: string
  defaultChecked?: boolean
  checked?: boolean
  hint?: string
  onChange?: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-9 items-start gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-700">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        defaultChecked={checked === undefined ? defaultChecked ?? false : undefined}
        onChange={(event) => onChange?.(event.target.checked)}
        className="mt-0.5 size-4 rounded border-zinc-300 accent-teal-700"
      />
      <span>
        <span className="block">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-xs font-normal leading-5 text-zinc-500">
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  )
}

function ImportPreview({
  preview,
}: {
  preview?: PartnerActionState["importPreview"]
}) {
  if (!preview) return null

  const counts = [
    ["Categories", preview.categories],
    ["Items", preview.items],
    ["Add-ons", preview.addons],
    ["Images matched", preview.imagesMatched],
    ["Images missing", preview.imagesMissing],
  ] as const

  return (
    <section className="space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-3" aria-label="ZIP import preview">
      <div>
        <h4 className="text-sm font-semibold text-sky-950">ZIP import preview</h4>
        <p className="mt-1 text-xs leading-5 text-sky-800">
          Nothing has been saved yet. Review this preview before confirming.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {counts.map(([label, value]) => (
          <div key={label} className="rounded-md border border-sky-100 bg-white px-2 py-2">
            <dt className="text-[11px] text-zinc-500">{label}</dt>
            <dd className="mt-0.5 text-base font-bold text-zinc-900">{value}</dd>
          </div>
        ))}
      </dl>
      {preview.errors.length ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
          <p className="font-semibold">Validation errors</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {preview.errors.map((error, index) => <li key={`${error}:${index}`}>{error}</li>)}
          </ul>
        </div>
      ) : null}
      {preview.warnings.length ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <p className="font-semibold">Warnings</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {preview.warnings.map((warning, index) => <li key={`${warning}:${index}`}>{warning}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function ActionMessage({
  state,
  toast = true,
}: {
  state: PartnerActionState
  toast?: boolean
}) {
  useToastNotification(toast ? state : initialState)

  if (!state.message) {
    return null
  }

  return (
    <p
      className={`whitespace-pre-line rounded-md border px-3 py-2 text-sm ${
        state.issues
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : state.ok
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-rose-200 bg-rose-50 text-rose-700"
      }`}
      aria-live="polite"
    >
      {state.message}
    </p>
  )
}

function IconDeleteSubmitButton({
  label,
  pendingOverride = false,
}: {
  label: string
  pendingOverride?: boolean
}) {
  const { pending: formPending } = useFormStatus()
  const pending = formPending || pendingOverride

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      title={label}
      className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-full border border-white/70 bg-white/92 text-rose-700 shadow-md backdrop-blur transition hover:scale-105 hover:bg-rose-50 disabled:cursor-wait disabled:text-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      {pending ? (
        <LoadingSpinner className="size-3.5" />
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
        </svg>
      )}
    </button>
  )
}

function GenerateDescriptionButton({
  onClick,
  pending,
}: {
  onClick: () => void
  pending: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-busy={pending}
      title="Generate with Content-Agent"
      className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold leading-none text-teal-800 transition hover:-translate-y-px hover:bg-teal-100 active:translate-y-0 disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? (
        <LoadingSpinner className="size-3.5" />
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        >
          <path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z" />
          <path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14Z" />
        </svg>
      )}
      <span>{pending ? "Generating..." : "Generate with Content-Agent"}</span>
    </button>
  )
}

function ContentAgentSuggestionButton({
  fieldLabel,
  onClick,
  pending,
}: {
  fieldLabel: string
  onClick: () => void
  pending: boolean
}) {
  const label = `Vorschlag mit Content-Agent für ${fieldLabel}`

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={label}
      title={label}
      aria-busy={pending}
      className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold leading-none text-teal-800 transition hover:-translate-y-px hover:bg-teal-100 active:translate-y-0 disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? (
        <LoadingSpinner className="size-3.5" />
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        >
          <path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z" />
          <path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14Z" />
        </svg>
      )}
      <span>Content-Agent</span>
    </button>
  )
}

function SubmitButton({
  disabled = false,
  label,
  name,
  pendingLabel,
  pendingOverride = false,
  size = "default",
  tone = "default",
  value,
}: {
  disabled?: boolean
  label: string
  name?: string
  pendingLabel: string
  pendingOverride?: boolean
  size?: "default" | "compact" | "tiny"
  tone?: "default" | "danger" | "muted" | "outline"
  value?: string
}) {
  const { data, pending: formPending } = useFormStatus()
  const pending = formPending || pendingOverride
  const isActivePending =
    pending && (!name || value === undefined || data?.get(name) === value)
  const sizeClasses =
    size === "tiny"
      ? "h-8 px-3 text-xs"
      : size === "compact"
        ? "h-9 px-3 text-sm"
        : "h-10 px-4 text-sm"
  const toneClasses =
    tone === "danger"
      ? "bg-rose-700 text-white hover:bg-rose-800 disabled:bg-zinc-300"
      : tone === "muted"
        ? "border border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400"
        : tone === "outline"
          ? "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400"
          : "bg-teal-700 text-white hover:bg-teal-800 disabled:bg-zinc-300"

  return (
    <button
      type="submit"
      name={name}
      disabled={disabled || pending}
      aria-busy={isActivePending}
      value={value}
      className={`${sizeClasses} inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold leading-none transition active:translate-y-px disabled:cursor-not-allowed ${toneClasses}`}
    >
      {isActivePending ? <LoadingSpinner className={size === "tiny" ? "size-3" : "size-4"} /> : null}
      {isActivePending ? pendingLabel : label}
    </button>
  )
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = "default",
  onCancel,
  onConfirm,
  children,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  tone?: "default" | "danger"
  onCancel: () => void
  onConfirm: () => void
  children?: ReactNode
}) {
  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/50 px-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-5 shadow-xl"
      >
        <h3
          id="confirm-dialog-title"
          className="text-base font-semibold text-zinc-950"
        >
          {title}
        </h3>
        <p
          id="confirm-dialog-description"
          className="mt-2 text-sm leading-6 text-zinc-600"
        >
          {description}
        </p>
        {children}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`h-10 rounded-md px-4 text-sm font-semibold text-white transition ${
              tone === "danger"
                ? "bg-rose-700 hover:bg-rose-800"
                : "bg-teal-700 hover:bg-teal-800"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function LogoPreview({
  url,
  name,
}: {
  url?: string | null
  name?: string | null
}) {
  if (url) {
    return (
      <div
        aria-hidden="true"
        className="size-11 rounded-full border border-zinc-200 bg-cover bg-center"
        style={{ backgroundImage: `url(${url})` }}
      />
    )
  }

  return (
    <div className="grid size-11 place-items-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-500">
      {(name?.trim()?.[0] ?? "B").toUpperCase()}
    </div>
  )
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex min-h-6 shrink-0 items-center whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold leading-none shadow-sm ${
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-zinc-200 bg-zinc-100 text-zinc-600"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  )
}

function Badge({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 shadow-sm ${className}`}
    >
      {children}
    </span>
  )
}

function FeaturedBadge({ compact = false }: { compact?: boolean }) {
  return (
    <Badge
      className={`inline-flex items-center gap-1.5 whitespace-nowrap ${
        compact ? "px-2 py-0.5" : ""
      }`}
    >
      <StarIcon className="size-3.5" />
      <span>Featured</span>
    </Badge>
  )
}

function StarIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
    >
      <path d="M10 1.75l2.34 4.74 5.23.76-3.78 3.69.89 5.21L10 13.69l-4.68 2.46.89-5.21-3.78-3.69 5.23-.76L10 1.75z" />
    </svg>
  )
}

function ResultLimitNote({
  itemLabel,
  totalCount,
  visibleCount,
}: {
  itemLabel: string
  totalCount: number
  visibleCount: number
}) {
  const hiddenCount = Math.max(totalCount - visibleCount, 0)
  const message = hiddenCount
    ? `Showing ${visibleCount} of ${totalCount} ${itemLabel}; ${hiddenCount} more are loaded but hidden here.`
    : `Showing ${visibleCount} of ${totalCount} ${itemLabel}.`

  return (
    <p className="text-xs font-medium text-zinc-500">
      {message}
    </p>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-medium text-zinc-800">{label}:</span> {value}
    </p>
  )
}

function isPartnerActive(partner: PartnerWithDeals) {
  if (typeof partner.is_active === "boolean") {
    return partner.is_active
  }

  return partner.status === "active"
}

function formatPartnerCoordinates(partner?: {
  coordinates?: string | {
    latitude?: number | null
    longitude?: number | null
  } | null
} | null) {
  return formatCoordinatesValue(partner?.coordinates)
}

function formatCoordinatesValue(coordinates?: string | {
  latitude?: number | null
  longitude?: number | null
} | null) {
  if (!coordinates) {
    return ""
  }

  if (typeof coordinates === "string") {
    const trimmed = coordinates.trim()

    if (!trimmed) {
      return ""
    }

    try {
      const parsed: unknown = JSON.parse(trimmed)

      if (isCoordinateRecord(parsed)) {
        return formatCoordinatePair(parsed.latitude, parsed.longitude)
      }
    } catch {
      return trimmed
    }

    return trimmed
  }

  return formatCoordinatePair(coordinates.latitude, coordinates.longitude)
}

function formatCoordinatePair(
  latitude?: number | null,
  longitude?: number | null,
) {
  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined
  ) {
    return ""
  }

  return `${latitude}, ${longitude}`
}

function isCoordinateRecord(value: unknown): value is {
  latitude?: number | null
  longitude?: number | null
} {
  return typeof value === "object" && value !== null
}

type ComebackCandidate = {
  userId: string
  userLabel: string
  userEmail: string
  visitCount: number
  lastVisit: string
  inactiveDays: number
  averageIntervalDays: number | null
}

const millisecondsPerDay = 24 * 60 * 60 * 1000

function backendDealTypeForUi(type: string) {
  return type === DURATION_BONUS_DEAL || type === COMEBACK_INACTIVE_DEAL
    ? "comeback"
    : type
}

function dealUiTypeForDeal(deal?: Pick<Deal, "type" | "metadata"> | null) {
  const type = deal?.type || "discount"

  if (type !== "comeback") {
    return type
  }

  return metadataString(metadataObject(deal?.metadata), "bonus_mode") ===
    COMEBACK_INACTIVE_MODE
    ? COMEBACK_INACTIVE_DEAL
    : DURATION_BONUS_DEAL
}

function dealCardTypeLabel(deal: Deal) {
  if (deal.type === "challenge") {
    const challengeName = metadataString(
      metadataObject(deal.metadata),
      "challenge_name",
    )

    if (challengeName) {
      return challengeName
    }
  }

  return benefitTaxonomyLabel(deal, "de")
}

function metadataObject(value: unknown): Record<string, unknown> {
  if (!value) {
    return {}
  }

  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value)
      return metadataObject(parsed)
    } catch {
      return {}
    }
  }

  return typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]

  return typeof value === "string" ? value : ""
}

function metadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]

  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string" && value.trim()) {
    const numericValue = Number(value)

    return Number.isFinite(numericValue) ? numericValue : null
  }

  return null
}

function periodToDays(value: number, unit: string) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }

  if (unit === "weeks") {
    return value * 7
  }

  if (unit === "months") {
    return value * 30
  }

  return value
}

function formatDealRewardSummary(deal: Deal) {
  const reward = formatDraftRewardSummary(
    normalizeDiscountTypeForUi(deal.type ?? "discount", deal.discount_type),
    deal.discount_value ?? null,
    deal.reward_item ?? "",
    deal.benefit_count ?? null,
  )

  if (deal.type === "happy_hour") {
    const start = formatTimeInput(deal.happy_hour_start)
    const end = formatTimeInput(deal.happy_hour_end)
    const timeWindow = start && end ? `${start}-${end}` : "Time not set"

    return `${reward} - ${timeWindow} - ${formatWeekdayNumberSummary(
      deal.valid_weekdays,
    )}`
  }

  return reward
}

function buildComebackCandidates(visits: Visit[]): ComebackCandidate[] {
  const visitsByUser = new Map<string, Visit[]>()

  for (const visit of visits) {
    if (!visit.user_id || !visit.visited_at) {
      continue
    }

    visitsByUser.set(visit.user_id, [
      ...(visitsByUser.get(visit.user_id) ?? []),
      visit,
    ])
  }

  const now = Date.now()
  const candidates: ComebackCandidate[] = []

  for (const [userId, userVisits] of visitsByUser) {
    const datedVisits = userVisits
      .map((visit) => ({
        visit,
        visitedAtTime: new Date(visit.visited_at ?? "").getTime(),
      }))
      .filter(({ visitedAtTime }) => !Number.isNaN(visitedAtTime))
      .sort((first, second) => first.visitedAtTime - second.visitedAtTime)

    if (!datedVisits.length) {
      continue
    }

    const intervals = []

    for (let index = 1; index < datedVisits.length; index += 1) {
      intervals.push(
        (datedVisits[index].visitedAtTime -
          datedVisits[index - 1].visitedAtTime) /
          millisecondsPerDay,
      )
    }

    const lastVisit = datedVisits[datedVisits.length - 1]
    const averageIntervalDays = intervals.length
      ? intervals.reduce((total, interval) => total + interval, 0) /
        intervals.length
      : null

    candidates.push({
      userId,
      userLabel:
        lastVisit.visit.user_name ||
        lastVisit.visit.user_email ||
        shortId(userId),
      userEmail: lastVisit.visit.user_email ?? "",
      visitCount: datedVisits.length,
      lastVisit: lastVisit.visit.visited_at ?? "",
      inactiveDays: Math.max(
        0,
        (now - lastVisit.visitedAtTime) / millisecondsPerDay,
      ),
      averageIntervalDays,
    })
  }

  return candidates.sort((first, second) => {
    const inactiveSort = second.inactiveDays - first.inactiveDays

    if (inactiveSort !== 0) {
      return inactiveSort
    }

    return second.visitCount - first.visitCount
  })
}

function formatTimeInput(value?: string | null) {
  return value ? value.slice(0, 5) : ""
}

function formatPrice(value?: number | string | null, currency?: string | null) {
  if (value === null || value === undefined) {
    return "Price not set"
  }

  const numericValue = typeof value === "number" ? value : Number(value)

  if (!Number.isFinite(numericValue)) {
    return `${value} ${currency || "EUR"}`
  }

  return `${numericValue.toFixed(2)} ${currency || "EUR"}`
}

function formatOptionalNumber(value?: number | null) {
  return value === null || value === undefined ? "Not set" : String(value)
}

function formatDays(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Not set"
  }

  if (value < 1) {
    return "<1 day"
  }

  const roundedValue =
    value >= 10 ? Math.round(value) : Math.round(value * 10) / 10

  return `${roundedValue} ${roundedValue === 1 ? "day" : "days"}`
}

function formatComebackCandidateReason(
  candidate: ComebackCandidate,
  inactiveThresholdDays: number,
) {
  const daysPastThreshold = candidate.inactiveDays - inactiveThresholdDays

  if (daysPastThreshold <= 0) {
    return "At comeback threshold"
  }

  return `${formatDays(daysPastThreshold)} past threshold`
}

function formatTextInputValue(value?: string | number | null) {
  return value === null || value === undefined ? "" : String(value)
}

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim()

  if (trimmed.length <= maxLength) {
    return trimmed
  }

  return `${trimmed.slice(0, Math.max(maxLength - 1, 0)).trimEnd()}...`
}

function parseOptionalNumberInput(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const numericValue = typeof value === "number" ? value : Number(value)

  return Number.isFinite(numericValue) ? numericValue : null
}

function socialDraftsFromPartner(socials?: PartnerSocial[] | null) {
  return (socials ?? []).map((social) => ({
    id: social.id ?? crypto.randomUUID(),
    platform: social.platform ?? "",
    handle: social.handle || socialHandleFromUrl(social.url),
  }))
}

function socialHandleFromUrl(url?: string | null) {
  const value = url?.trim()

  if (!value) {
    return ""
  }

  try {
    const parsed = new URL(value)
    const queryId = parsed.searchParams.get("id")

    if (queryId) {
      return queryId
    }

    const [firstSegment = ""] = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean)

    return firstSegment.replace(/^@+/, "")
  } catch {
    return value
  }
}

function CopyFromPartnerPanel({
  partners,
  onApply,
}: {
  partners: PartnerWithDeals[]
  onApply: (source: PartnerWithDeals) => void
}) {
  const [selectedId, setSelectedId] = useState("")
  const selectedPartner = partners.find((p) => p.id === selectedId) ?? null

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 space-y-1.5">
          <p className="font-semibold text-amber-900">Copy from existing partner</p>
          <p className="text-xs leading-5 text-amber-800">
            Pre-fill this form from an existing partner&apos;s profile. You can edit anything afterwards.
          </p>
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-amber-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          >
            <option value="">Select a partner…</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id ?? ""}>
                {p.name || "Untitled partner"}
                {p.city_name ? ` — ${p.city_name}` : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={!selectedPartner}
          onClick={() => {
            if (selectedPartner) {
              onApply(selectedPartner)
              setSelectedId("")
            }
          }}
          className="h-10 rounded-md bg-amber-700 px-4 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Apply
        </button>
      </div>
      {selectedPartner ? (
        <p className="mt-2 text-xs text-amber-800">
          Will copy: type, city, description, categories, phone, website, social handles, and milestones. Name, email, address, and owner will not be copied.
        </p>
      ) : null}
    </div>
  )
}

function createInitialMilestoneDraft(): InitialMilestoneDraft {
  return {
    id: crypto.randomUUID(),
    active: true,
    audience: DEFAULT_AUDIENCE,
    customerDescription: "",
    discountValue: "",
    estimatedSavings: "",
    requiredStamps: String(MAX_STAMP_CARD_STAMPS),
    rewardItem: "",
    rewardType: "item",
    staffInstructions: "",
    terms: "",
    title: "",
  }
}

function isSoldOutDealDrop(
  stockTotal: number | null,
  stockRemaining: number | null,
) {
  return stockTotal !== null && stockTotal > 0 && stockRemaining !== null && stockRemaining <= 0
}

function normalizeWeekdayNumbers(values?: Array<number | string> | null) {
  const normalized = Array.from(
    new Set(
      (values ?? [])
        .map((value) => weekdayNumberFromValue(value))
        .filter((value): value is number => value !== null),
    ),
  ).sort((first, second) => first - second)

  return normalized.length ? normalized : [...DEFAULT_DEAL_DROP_WEEKDAYS]
}

function formatWeekdayNumberSummary(values?: Array<number | string> | null) {
  const selected = normalizeWeekdayNumbers(values)

  if (selected.length === 7) {
    return "Every day"
  }

  if (selected.join(",") === "1,2,3,4,5") {
    return "Mon-Fri"
  }

  if (selected.join(",") === "6,7") {
    return "Sat-Sun"
  }

  const labelsByValue = new Map<number, string>(
    dealDropWeekdayOptions.map((option) => [option.value, option.label]),
  )

  return selected.map((value) => labelsByValue.get(value) ?? value).join(", ")
}

function weekdayNumberFromValue(value: number | string) {
  if (typeof value === "number") {
    return value >= 1 && value <= 7 ? value : null
  }

  const normalized = value.trim().toLowerCase()
  const numericValue = Number.parseInt(normalized, 10)

  if (Number.isInteger(numericValue) && numericValue >= 1 && numericValue <= 7) {
    return numericValue
  }

  const namedWeekdays: Record<string, number> = {
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
    sunday: 7,
    sun: 7,
  }

  return namedWeekdays[normalized] ?? null
}

function formatDealDropRewardTitle(
  discountType: string,
  discountValue: number | null,
  rewardItem: string,
) {
  const item = rewardItem.trim()

  if (discountType === "item") {
    return item ? `Gratis ${item}` : "Gratisartikel"
  }

  if (discountType === "percent") {
    return discountValue !== null ? `${discountValue} % Rabatt` : "Prozentualer Rabatt"
  }

  if (discountType === "fixed") {
    return discountValue !== null
      ? `${discountValue} € Rabatt`
      : "Fester Rabatt"
  }

  if (normalizeDiscountTypeForUi("limited_drop", discountType) === "2for1") {
    return item ? `2 für 1 ${item}` : "2 für 1"
  }

  return "Deal Drop"
}

function formatDealDropRewardText(discountType: string) {
  if (discountType === "item") {
    return "Gratisartikel"
  }

  return labelForValue(discountTypeOptions, discountType) || "Vorteilsvorschau"
}

function formatDealDropStockState(
  stockTotal: number | null,
  stockRemaining: number | null,
  soldOut: boolean,
) {
  if (soldOut) {
    return "Sold out"
  }

  if (stockTotal !== null && stockTotal > 0) {
    return stockRemaining !== null
      ? `Only ${stockRemaining} left`
      : `${stockTotal} available`
  }

  return "No stock limit"
}

function formatCountdownState(endsAt: string) {
  if (!endsAt) {
    return "No end date"
  }

  const endTime = new Date(endsAt).getTime()

  if (Number.isNaN(endTime)) {
    return "End date not set"
  }

  const milliseconds = endTime - Date.now()

  if (milliseconds <= 0) {
    return "Ended"
  }

  return `Ends in ${formatDuration(milliseconds)}`
}

function formatDuration(milliseconds: number) {
  const minutes = Math.ceil(milliseconds / 60000)

  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.ceil(minutes / 60)

  if (hours < 24) {
    return `${hours}h`
  }

  return `${Math.ceil(hours / 24)}d`
}

function formatSavingsPreview(discountType: string, value: number | null) {
  if (discountType === "percent") {
    return "Cannot estimate"
  }

  return value === null ? "Not set" : String(value)
}

function formatPreviewAccessLabel(audience: string, trialEligible: boolean) {
  const audienceLabel = dealAudienceValueLabel(audience)

  if (!trialEligible) {
    return audienceLabel
  }

  if (audience === "premium") {
    return "Premium + Trial Eligible"
  }

  return `${audienceLabel} + Trial Eligible`
}

function formatPreviewExpiryInfo(endsAt: string, expiryDays: number | null) {
  if (endsAt) {
    return formatDateTime(endsAt)
  }

  if (expiryDays !== null && expiryDays > 0) {
    return `${expiryDays} day${expiryDays === 1 ? "" : "s"} after selection`
  }

  return "No expiry set"
}

function normalizeDealDropDiscountType(dealType: string, discountType: string) {
  if (dealType !== "limited_drop") {
    return discountType
  }

  if (!discountType || discountType === "none" || discountType === "bonus_stamp") {
    return "item"
  }

  return discountType === "twoforone" ? "2for1" : discountType
}

function normalizePartnerTypeValue(value?: string | null) {
  const trimmed = value?.trim()

  if (!trimmed) {
    return "Food & Drink"
  }

  const normalized = trimmed.toLowerCase()

  return normalized === "restaurant" || normalized === "restuarant"
    ? "Food & Drink"
    : trimmed
}

function partnerTypeSupportsMenu(value?: string | null) {
  return normalizePartnerTypeValue(value) === "Food & Drink"
}

function normalizeHolidayDateInput(value?: string | null) {
  const trimmed = value?.trim() ?? ""

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return ""
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`)

  if (Number.isNaN(parsed.getTime())) {
    return ""
  }

  return parsed.toISOString().slice(0, 10) === trimmed ? trimmed : ""
}

function formatHolidayDateLabel(value: string) {
  const normalized = normalizeHolidayDateInput(value)

  if (!normalized) {
    return value
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`)

  return Number.isNaN(parsed.getTime())
    ? normalized
    : parsed.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
}

function syncExpandedDraftIds(
  ids: string[],
  knownIdsRef: { current: Set<string> },
  setExpandedIds: (updater: (current: string[]) => string[]) => void,
) {
  setExpandedIds((current) => {
    const validIds = new Set(ids)
    const newIds = ids.filter((id) => !knownIdsRef.current.has(id))

    knownIdsRef.current = validIds

    if (newIds.length) {
      return newIds
    }

    const next = new Set(current.filter((id) => validIds.has(id)))

    return Array.from(next)
  })
}

function toggleDraftId(current: string[], id: string) {
  return current.includes(id)
    ? current.filter((value) => value !== id)
    : [...current, id]
}

function nextAvailablePosition(
  values: Array<string | number | null | undefined>,
) {
  const usedPositions = new Set(
    values
      .map(integerFromValue)
      .filter((value): value is number => value !== null && value >= 0),
  )
  let position = 0

  while (usedPositions.has(position)) {
    position += 1
  }

  return position
}

function sortInitialCategories(categories: InitialMenuCategoryDraft[]) {
  return [...categories].sort((first, second) =>
    compareSortPositions(first.sortOrder, second.sortOrder),
  )
}

function sortInitialItems(
  items: InitialMenuItemDraft[],
  categories: InitialMenuCategoryDraft[],
) {
  const categoryPositions = new Map(
    sortInitialCategories(categories).map((category, index) => [
      category.id,
      index,
    ]),
  )

  return [...items].sort((first, second) => {
    const categorySort =
      (categoryPositions.get(first.categoryDraftId) ?? Number.MAX_SAFE_INTEGER) -
      (categoryPositions.get(second.categoryDraftId) ?? Number.MAX_SAFE_INTEGER)

    return (
      categorySort ||
      compareSortPositions(first.sortOrder, second.sortOrder)
    )
  })
}

function sortMenuCategories(categories: MenuCategory[]) {
  return [...categories].sort((first, second) =>
    compareSortPositions(first.sort_order, second.sort_order),
  )
}

function sortMenuItems(items: MenuItem[]) {
  return [...items].sort((first, second) =>
    compareSortPositions(first.sort_order, second.sort_order),
  )
}

function compareSortPositions(
  first: string | number | null | undefined,
  second: string | number | null | undefined,
) {
  const firstPosition = integerFromValue(first)
  const secondPosition = integerFromValue(second)

  if (firstPosition === null && secondPosition === null) {
    return 0
  }

  if (firstPosition === null) {
    return 1
  }

  if (secondPosition === null) {
    return -1
  }

  return firstPosition - secondPosition
}

function normalizeInitialCategoryPositions(
  categories: InitialMenuCategoryDraft[],
) {
  return sortInitialCategories(categories).map((category, index) => ({
    ...category,
    sortOrder: String(index),
  }))
}

function normalizeInitialItemPositions(items: InitialMenuItemDraft[]) {
  return sortInitialItems(items, []).map((item, index) => ({
    ...item,
    sortOrder: String(index),
  }))
}

function moveIdBeforeTarget(ids: string[], draggedId: string, targetId: string) {
  const nextIds = ids.filter((id) => id !== draggedId)
  const targetIndex = nextIds.indexOf(targetId)

  if (targetIndex === -1) {
    return ids
  }

  nextIds.splice(targetIndex, 0, draggedId)
  return nextIds
}

function reorderRowsByIds<T extends { id?: string | null }>(
  rows: T[],
  orderedIds: string[],
) {
  const rowById = new Map(
    rows
      .filter((row): row is T & { id: string } => Boolean(row.id))
      .map((row) => [row.id, row] as const),
  )
  const orderedRows: T[] = []
  const orderedIdSet = new Set(orderedIds)

  for (const id of orderedIds) {
    const row = rowById.get(id)

    if (row) {
      orderedRows.push(row)
    }
  }

  return [
    ...orderedRows,
    ...rows.filter((row) => !row.id || !orderedIdSet.has(row.id)),
  ]
}

function applyLocalSortOrder<T extends { id?: string | null; sort_order?: number | null }>(
  rows: T[],
  orderedIds: string[],
) {
  if (!orderedIds.length) {
    return rows
  }

  return reorderRowsByIds(rows, orderedIds).map((row, index) => ({
    ...row,
    sort_order: index,
  }))
}

function integerFromValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const numericValue =
    typeof value === "number" ? value : Number.parseInt(value, 10)

  return Number.isInteger(numericValue) ? numericValue : null
}

function withCurrentOption(
  options: readonly { value: string; label: string }[],
  current?: string | null,
) {
  if (!current || options.some((option) => option.value === current)) {
    return [...options]
  }

  return [{ value: current, label: current }, ...options]
}

function withCurrentOptions(
  options: readonly { value: string; label: string }[],
  current?: string[] | null,
) {
  const missingOptions =
    current
      ?.filter(
        (value) => value && !options.some((option) => option.value === value),
      )
      .map((value) => ({ value, label: value })) ?? []

  return [...missingOptions, ...options]
}

function labelForValue(
  options: readonly { value: string; label: string }[],
  value?: string | null,
) {
  return options.find((option) => option.value === value)?.label ?? value ?? ""
}

function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-sky-900">
      {children}
    </div>
  )
}

function WarningNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
      {children}
    </div>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600">
      {children}
    </div>
  )
}

function formatRewardValue(
  discountType?: string | null,
  discountValue?: number | null,
) {
  const label = labelForValue(discountTypeOptions, discountType)

  if (discountValue === null || discountValue === undefined) {
    return label || "Nicht festgelegt"
  }

  if (discountType === "percent") {
    return `${discountValue} % Rabatt`
  }

  if (discountType === "fixed") {
    return `${discountValue} € Rabatt`
  }

  if (discountType === "bonus_stamp") {
    return `+${discountValue} Bonusstempel`
  }

  return `${label || "Wert"} ${discountValue}`
}

function formatBenefitCategory(value?: string | null) {
  const labels: Record<string, string> = {
    direct_selectable: "Vor dem Besuch auswählen",
    automatic_background: "Automatisch beim Scan",
    automatic_fallback: "Automatisch als Fallback",
    base_stamp: "Basisstempel",
  }

  return formatTechnicalLabel(value, labels)
}

function formatBenefitSource(value?: string | null) {
  const labels: Record<string, string> = {
    base_stamp: "Basisstempel",
    selected_direct_deal: "Ausgewählter direkter Vorteil",
    fallback_deal: "Fallback-Vorteil",
    reward_milestone: "Stempelbelohnung",
  }

  return formatTechnicalLabel(value, labels)
}

function formatTechnicalLabel(
  value: string | null | undefined,
  labels: Record<string, string>,
) {
  if (!value) {
    return "Nicht festgelegt"
  }

  return (
    labels[value] ??
    value
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  )
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not set"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function formatDateTimeInput(value?: string | null) {
  if (!value) {
    return ""
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toISOString().slice(0, 16)
}

function formatMetadataInput(value: unknown) {
  if (!value) {
    return ""
  }

  if (typeof value === "string") {
    try {
      JSON.parse(value)
      return value
    } catch {
      return JSON.stringify(value)
    }
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ""
  }
}

function shortId(value?: string | null) {
  if (!value) {
    return "Not set"
  }

  return value.length > 12 ? value.slice(0, 12) : value
}

function formatIdList(values: Array<string | null | undefined>) {
  const visibleValues = values.filter(Boolean) as string[]

  if (visibleValues.length === 0) {
    return "Not set"
  }

  return visibleValues.slice(0, 3).map(shortId).join(", ")
}
