"use client"

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import type {
  City,
  Deal,
  MenuCategory,
  MenuItem,
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
  approveMenu,
  deleteDeal,
  deleteMenu,
  deleteMenuCategory,
  deleteMenuItem,
  deletePartnerStaff,
  deletePartner,
  deleteRewardMilestone,
  reorderMenuCategories,
  reorderMenuItems,
  saveDeal,
  saveMenu,
  saveMenuCategory,
  saveMenuItem,
  savePartnerStaff,
  savePartner,
  saveRewardMilestone,
  saveWeeklyOpeningHours,
  type PartnerActionState,
} from "./partner-actions"

const initialState: PartnerActionState = {
  ok: false,
  message: "",
}

const partnerTypeOptions = [
  { value: "Food & Drink", label: "Food & Drink" },
  { value: "Services", label: "Services" },
  { value: "Wellness", label: "Wellness" },
  { value: "Activities", label: "Activities" },
]

const categoryOptions = [
  "Doner",
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

const dealUiTypeOptions = dealTypeOptions.flatMap((option) =>
  option.value === "comeback"
    ? [
        { value: DURATION_BONUS_DEAL, label: "Duration Bonus" },
        { value: COMEBACK_INACTIVE_DEAL, label: "Comeback Deal" },
      ]
    : [option],
)

const durationUnitOptions = [
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
] as const

const inactivityUnitOptions = [
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
] as const

const menuStatusOptions = [
  { value: "draft", label: "Draft" },
  { value: "review", label: "Needs review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
] as const

type PartnerWorkspaceProps = {
  partners: PartnerWithDeals[]
  cities: City[]
  owners: OwnerOption[]
}

type InitialDealDraft = {
  id: string
  active: boolean
  benefitCategory?: string
  dealType?: string
  discountType?: string
  rewardSummary?: string
  title: string
}

type InitialMenuCategoryDraft = {
  id: string
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
  sortOrder: string
}

type SocialHandleDraft = {
  id: string
  platform: string
  handle: string
}

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

type PendingMenuReview = {
  id?: string
  menuName: string
  partnerId: string
  partnerName: string
  categories: number
  items: number
  updatedAt: string | null
}

type SectionStatusTone = "info" | "recommended" | "required" | "required-subtle"

type SectionStatus = {
  label: string
  tone?: SectionStatusTone
}

type SectionStatusValue = SectionStatus | SectionStatus[]

export function PartnerWorkspace({
  partners,
  cities,
  owners,
}: PartnerWorkspaceProps) {
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<"view" | "create">(
    partners.length ? "view" : "create",
  )
  const [selectedId, setSelectedId] = useState(partners[0]?.id ?? "")
  const startCreatePartner = useCallback(() => {
    setSelectedId("")
    setMode("create")
  }, [])

  const partnerCount = partners.length
  const activePartners = partners.filter(isPartnerActive).length
  const featuredPartners = partners.filter((partner) => partner.is_featured).length
  const dealCount = partners.reduce(
    (count, partner) => count + partner.deals.length,
    0,
  )
  const pendingMenuReviews = useMemo(
    () =>
      partners.flatMap((partner) =>
        partner.menus
          .filter((menu) => menu.status === "review")
          .map((menu) => ({
            id: menu.id,
            menuName: menu.name || "Untitled menu",
            partnerId: partner.id ?? "",
            partnerName: partner.name || "Untitled partner",
            categories: menu.categories.length,
            items: menu.items.length,
            updatedAt: menu.updated_at,
          })),
      ),
    [partners],
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
    <section id="partners" className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <LiveMetric label="Partners" value={partnerCount} />
        <LiveMetric label="Active partners" value={activePartners} />
        <LiveMetric label="Featured partners" value={featuredPartners} />
        <LiveMetric label="Deals" value={dealCount} />
        <LiveMetric label="Menu approvals required" value={pendingMenuReviews.length} />
      </div>

      <PendingMenuReviewPanel
        reviews={pendingMenuReviews}
        onSelectPartner={(partnerId) => {
          setSelectedId(partnerId)
          setMode("view")
        }}
      />

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-md border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-normal">
                  Partners
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Select a partner to edit its profile and deals.
                </p>
              </div>
              <button
                type="button"
                onClick={startCreatePartner}
                className="h-9 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white transition hover:bg-teal-800"
              >
                Add
              </button>
            </div>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search partners"
              className="mt-4 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          <div className="max-h-[calc(100vh-280px)] space-y-2 overflow-y-auto p-3">
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
                cities={cities}
                owners={owners}
                onDeleted={startCreatePartner}
                partner={selectedPartner}
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
    <div className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-normal text-zinc-950">
        {value}
      </p>
    </div>
  )
}

function PendingMenuReviewPanel({
  reviews,
  onSelectPartner,
}: {
  reviews: PendingMenuReview[]
  onSelectPartner: (partnerId: string) => void
}) {
  const visibleReviews = reviews.slice(0, 6)
  const hiddenCount = Math.max(reviews.length - visibleReviews.length, 0)

  if (!reviews.length) {
    return null
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-zinc-900">Menu approvals required</span>
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {reviews.length}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {visibleReviews.map((review) => (
            <button
              type="button"
              key={review.id ?? `${review.partnerId}-${review.menuName}`}
              onClick={() => onSelectPartner(review.partnerId)}
              className="max-w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-left text-xs font-medium text-zinc-700 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900 sm:max-w-72"
            >
              <span className="block truncate">{review.partnerName}</span>
              <span className="block truncate text-zinc-500">
                {review.menuName} · {review.items} items
              </span>
            </button>
          ))}
          {hiddenCount ? (
            <span className="inline-flex h-8 items-center rounded-md border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-500">
              +{hiddenCount} more
            </span>
          ) : null}
        </div>
      </div>
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
  const pendingMenuCount = partner.menus.filter(
    (menu) => menu.status === "review",
  ).length
  const hasDeals = partner.deals.length > 0

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md border p-3 text-left transition ${
        selected
          ? "border-teal-600 bg-teal-50"
          : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
      }`}
    >
      <div className="flex items-start gap-3">
        <LogoPreview url={partner.logo_url} name={partner.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
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
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                Deal recommended
              </span>
            ) : null}
            {pendingMenuCount ? (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {pendingMenuCount} menu {pendingMenuCount === 1 ? "review" : "reviews"}
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
}: {
  partner: PartnerWithDeals
  cities: City[]
  owners: OwnerOption[]
  onDeleted: () => void
}) {
  const partnerFormId = `partner-form-${partner.id ?? "partner"}`

  return (
    <div key={partner.id ?? "partner-detail"} className="space-y-5">
      <EditorShell
        title={partner.name || "Untitled partner"}
        description="Edit partner details, social handles, media, milestones, deals, menu, hours, and Supabase routing fields."
        aside={
          <div className="flex flex-wrap gap-2">
            <StatusPill active={isPartnerActive(partner)} />
            {partner.is_featured ? <FeaturedBadge /> : null}
          </div>
        }
      >
        <div className="space-y-5">
          <PartnerForm
            key={partner.id ?? "edit-partner"}
            formId={partnerFormId}
            cities={cities}
            owners={owners}
            partner={partner}
            mode="edit"
          />
          <div className="space-y-4">
            <OpeningHoursPanel partner={partner} embedded />
            <MilestonesPanel partner={partner} embedded />
            <DealsPanel partner={partner} embedded />
            {partnerTypeSupportsMenu(partner.type) ? (
              <MenuPanel partner={partner} embedded />
            ) : null}
          </div>
          <div className="space-y-4">
            <PartnerPinDisplay mode="edit" pin={partner.pin} />
            <button
              type="submit"
              form={partnerFormId}
              className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800"
            >
              Save partner
            </button>
          </div>
        </div>
      </EditorShell>

      <PartnerStaffPanel partner={partner} users={owners} />
      <StampProgressPanel progress={partner.stamp_progress} />
      <RedemptionHistoryPanel partner={partner} visits={partner.visits} />

      <EditorShell
        title="Remove partner"
        description="Deleting a partner also removes attached Supabase records through database relationships."
      >
        <DeletePartnerForm partner={partner} onDeleted={onDeleted} />
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
  defaultOpen = true,
  status,
}: {
  title: string
  description: string
  aside?: ReactNode
  children: ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  status?: SectionStatusValue
}) {
  const [open, setOpen] = useState(defaultOpen)
  const contentOpen = collapsible ? open : true

  return (
    <div className="rounded-md border border-zinc-200 bg-white shadow-sm">
      <div
        className={`flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between ${
          contentOpen ? "border-b border-zinc-200" : ""
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
          <div className="flex shrink-0 flex-wrap gap-2">
            {aside}
          </div>
        ) : null}
      </div>
      <div className={contentOpen ? "p-5" : "hidden"}>{children}</div>
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

function PartnerForm({
  partner,
  cities,
  formId,
  owners,
  mode,
  partners = [],
}: {
  partner?: PartnerWithDeals
  cities: City[]
  formId?: string
  owners: OwnerOption[]
  mode: "create" | "edit"
  partners?: PartnerWithDeals[]
}) {
  const [state, formAction] = useActionState(savePartner, initialState)
  const router = useRouter()
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
  const [initialMenuCategories, setInitialMenuCategories] = useState<
    InitialMenuCategoryDraft[]
  >([])
  const [initialMenuItems, setInitialMenuItems] = useState<
    InitialMenuItemDraft[]
  >([])
  const [confirmingSave, setConfirmingSave] = useState(false)
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
  const ownerOptions = withCurrentOption(
    owners.map((owner) => ({
      value: owner.id ?? owner.uid ?? "",
      label:
        [owner.display_name, owner.email].filter(Boolean).join(" - ") ||
        owner.id ||
        "Unnamed owner",
    })),
    partner?.owner_id,
  )
  const coordinateDefaultValue = formatPartnerCoordinates(partner)
  const menuSupported = partnerTypeSupportsMenu(selectedPartnerType)
  const requiredSectionsOpen = mode === "create"
  const requiredSectionMarker: boolean | "subtle" = "subtle"
  const handlePartnerTypeChange = (nextType: string) => {
    setSelectedPartnerType(nextType)

    if (!partnerTypeSupportsMenu(nextType)) {
      setInitialMenuEnabled(false)
    }
  }

  const applyTemplate = (source: PartnerWithDeals) => {
    const nextType = normalizePartnerTypeValue(source.type)
    setTemplateSource(source)
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
      router.refresh()
    }

    if (!(mode === "create" && state.ok && state.created)) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      setSocialHandles([])
      setInitialDeals([])
      setInitialMilestones([createInitialMilestoneDraft()])
      setInitialMenuEnabled(false)
      setInitialMenuCategories([])
      setInitialMenuItems([])
      setTemplateSource(null)
      setFormVersion((value) => value + 1)

      document
        .getElementById("partners")
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [mode, router, state.created, state.ok])

  return (
    <form
      id={formId}
      key={formVersion}
      ref={formRef}
      action={formAction}
      className="space-y-7"
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter
        pendingSubmitterRef.current =
          submitter instanceof HTMLButtonElement ? submitter : null

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

      {mode === "create" && partners.length > 0 ? (
        <CopyFromPartnerPanel partners={partners} onApply={applyTemplate} />
      ) : null}

      <FormSection title="Profile" required={requiredSectionMarker}>
        <FieldGrid>
          <TextField
            label="Partner name"
            name="name"
            defaultValue={partner?.name}
            required
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
          {owners.length ? (
            <SelectField
              label="Partner owner"
              name="owner_id"
              defaultValue={partner?.owner_id}
              options={ownerOptions}
              required
            />
          ) : (
            <TextField
              label="Owner ID"
              name="owner_id"
              defaultValue={partner?.owner_id}
              required
            />
          )}
          <TextField
            label="Email"
            name="email"
            type="email"
            defaultValue={partner?.email}
            required
          />
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
          defaultValue={partner?.description ?? templateSource?.description}
          required
        />
        <MultiSelectField
          label="Categories"
          name="category"
          defaultValues={partner?.category ?? templateSource?.category}
          options={withCurrentOptions(categoryOptions, partner?.category ?? templateSource?.category)}
          required
        />
      </FormSection>

      <FormSection
        title="Contact and Location"
        defaultOpen={false}
        required={requiredSectionMarker}
      >
        <FieldGrid>
          <TextField
            label="Phone"
            name="phone"
            defaultValue={partner?.phone ?? templateSource?.phone}
          />
          <TextField
            label="Website"
            name="website"
            type="url"
            defaultValue={partner?.website ?? templateSource?.website}
          />
          <TextField
            key={`coordinates-${partner?.id ?? "new"}-${coordinateDefaultValue}`}
            label="Coordinates"
            name="coordinates"
            defaultValue={coordinateDefaultValue}
            placeholder="49.196197048340196, 8.115435101852437"
            hint="Copy the latitude and longitude from Google Maps and paste them here."
            required
          />
        </FieldGrid>
        <TextAreaField
          label="Address"
          name="address"
          defaultValue={partner?.address}
          required
        />
        <div className="border-t border-zinc-100 pt-4">
          <div className="mb-4 space-y-1">
            <p className="text-sm font-semibold text-zinc-900">Social media</p>
            <p className="text-sm leading-6 text-zinc-600">
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

      {mode === "create" ? (
        <FormSection
          title="Operating Hours"
          defaultOpen={false}
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
            currentUrl={partner?.logo_url}
            spec={partnerMediaSpecs.logo}
          />
          <MediaUploadField
            key={`feature-${partner?.feature_card_url ?? "new"}`}
            label="Feature card"
            fileName="feature_card_file"
            existingName="existing_feature_card_url"
            removeName="remove_feature_card"
            currentUrl={partner?.feature_card_url}
            spec={partnerMediaSpecs.feature}
          />
          <MediaUploadField
            key={`discover-${partner?.discover_card_image_url ?? "new"}`}
            label="Discover page image"
            fileName="discover_card_file"
            existingName="existing_discover_card_image_url"
            removeName="remove_discover_card_image"
            currentUrl={partner?.discover_card_image_url}
            spec={partnerMediaSpecs.discover}
          />
        </div>
        <CoverUploadField
          key={`covers-${partner?.cover_urls?.join("|") ?? "new"}`}
          covers={partner?.cover_urls}
        />
      </FormSection>

      {mode === "create" ? (
        <>
          <FormSection
            title="Stamp-card milestones"
            defaultOpen={false}
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
            title="Deals"
            defaultOpen={false}
            status={{ label: "Recommended", tone: "recommended" }}
          >
            {initialDeals.length === 0 ? (
              <WarningNote>
                At least one deal is recommended, but the partner can be
                created without deals.
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

          {menuSupported ? (
            <FormSection title="Menu" defaultOpen={false}>
              <InitialMenuEditor
                categories={initialMenuCategories}
                enabled={initialMenuEnabled}
                items={initialMenuItems}
                onAddCategory={() =>
                  setInitialMenuCategories((current) => {
                    const normalized = normalizeInitialCategoryPositions(current)

                    return [
                      ...normalized,
                      {
                        id: crypto.randomUUID(),
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
          ) : null}
        </>
      ) : null}

      {mode === "create" ? (
        <PartnerPinDisplay mode="create" pin={partner?.pin ?? null} />
      ) : null}

      <ActionMessage state={state} />
      {mode === "create" ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <SubmitButton
            label="Add partner"
            pendingLabel="Adding partner..."
          />
        </div>
      ) : null}
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
    <div className="space-y-4">
      {rows.length ? (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div
              key={row.id}
              className="rounded-md border border-zinc-200 bg-zinc-50 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-zinc-900">
                  Handle {index + 1}
                </p>
                <button
                  type="button"
                  onClick={() => onRemove(row.id)}
                  className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                >
                  Remove
                </button>
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
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
                  placeholder="@benefitsi or https://instagram.com/benefitsi"
                  required
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState>No social handles added.</EmptyState>
      )}
      <button
        type="button"
        onClick={onAdd}
        disabled={rows.length >= MAX_PARTNER_SOCIALS}
        className="h-10 rounded-md border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-800 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
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
            className="rounded-md border border-zinc-200 bg-zinc-50 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-zinc-900">
                Milestone {index + 1}
              </p>
              {milestones.length > 1 ? (
                <button
                  type="button"
                  onClick={() => onRemove(milestone.id)}
                  className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                >
                  Remove
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
                label="Reward type"
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
                  label="Reward item"
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
                  title={`Deal ${index + 1}`}
                  rewardSummary={
                    deal.rewardSummary || deal.title || "Reward not set"
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
                      {expanded ? "Collapse" : "Edit"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(deal.id)}
                      className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                    >
                      Remove
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
          No deals staged.
        </div>
      )}
      <button
        type="button"
        onClick={handleAdd}
        className="h-10 rounded-md border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-800 transition hover:bg-teal-50"
      >
        Add deal
      </button>
    </div>
  )
}

function InitialMenuEditor({
  categories,
  enabled,
  items,
  onAddCategory,
  onAddItem,
  onRemoveCategory,
  onRemoveItem,
  onReorderCategories,
  onReorderItems,
  onSetEnabled,
  onUpdateCategory,
  onUpdateItem,
}: {
  categories: InitialMenuCategoryDraft[]
  enabled: boolean
  items: InitialMenuItemDraft[]
  onAddCategory: () => void
  onAddItem: () => void
  onRemoveCategory: (id: string) => void
  onRemoveItem: (id: string) => void
  onReorderCategories: (orderedIds: string[]) => void
  onReorderItems: (orderedIds: string[]) => void
  onSetEnabled: (enabled: boolean) => void
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
        <div className="space-y-5 rounded-md border border-zinc-200 bg-zinc-50 p-4">
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
              defaultValue="Speisekarte"
              required
            />
            <SelectField
              label="Menu approval status"
              name="initial_menu_status"
              defaultValue="draft"
              options={menuStatusOptions}
              required
            />
          </FieldGrid>
          <TextAreaField
            label="Menu description"
            name="initial_menu_description"
          />

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
                          <span className="block truncate text-sm font-semibold text-zinc-800">
                            {category.name || `Category ${index + 1}`}
                          </span>
                          <span className="mt-1 block text-xs text-zinc-500">
                            Position {category.sortOrder || "not set"}
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
                            <ThumbnailPreview
                              alt={`${item.name || `Item ${index + 1}`} preview`}
                              src={item.imagePreviewUrl}
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-zinc-800">
                                {item.name || `Item ${index + 1}`}
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
                          />
                          <TextField
                            label="Currency"
                            name={`initial_menu_item_${index}_currency`}
                            defaultValue="EUR"
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
                            hint="Separate tags with commas."
                          />
                          <TextField
                            label="Allergens"
                            name={`initial_menu_item_${index}_allergens`}
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
                          spec={partnerMediaSpecs.menuItem}
                          compact
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
  const [newDealDrafts, setNewDealDrafts] = useState<InitialDealDraft[]>([])
  const [autoExpandedDealIds, setAutoExpandedDealIds] = useState<string[]>([])
  const knownDealIdsRef = useRef<Set<string> | null>(null)
  const knownDealPartnerIdRef = useRef("")
  const partnerId = partner.id ?? ""

  useEffect(() => {
    const currentIds = partner.deals
      .map((deal) => deal.id)
      .filter((id): id is string => Boolean(id))

    if (knownDealPartnerIdRef.current !== partnerId) {
      knownDealPartnerIdRef.current = partnerId
      knownDealIdsRef.current = new Set(currentIds)
      setAutoExpandedDealIds([])
      setNewDealDrafts([])
      return
    }

    const knownIds = knownDealIdsRef.current ?? new Set(currentIds)
    const newIds = currentIds.filter((id) => !knownIds.has(id))

    if (newIds.length) {
      setAutoExpandedDealIds((current) =>
        Array.from(new Set([...current, ...newIds])),
      )
    }

    knownDealIdsRef.current = new Set(currentIds)
  }, [partner.deals, partnerId])

  const addDealDraft = () => {
    setNewDealDrafts((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        active: true,
        benefitCategory: "direct_selectable",
        dealType: "discount",
        discountType: "percent",
        rewardSummary: "percentage off",
        title: defaultDealDraftTitle(),
      },
    ])
  }
  const hasDealRows = partner.deals.length > 0 || newDealDrafts.length > 0
  const dealCount = partner.deals.length + newDealDrafts.length
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
          At least one deal is recommended, but this partner can exist
          without deals.
        </WarningNote>
      ) : null}
      {hasDealRows ? (
        <div className="space-y-3">
          {partner.deals.map((deal, index) => (
            <DealCard
              key={deal.id ?? `${deal.partner_id}-${deal.type}`}
              autoExpanded={Boolean(
                deal.id && autoExpandedDealIds.includes(deal.id),
              )}
              deal={deal}
              index={index}
              onAutoExpandedDismiss={() =>
                setAutoExpandedDealIds((current) =>
                  current.filter((id) => id !== deal.id),
                )
              }
              partnerId={partnerId}
              visits={partner.visits}
            />
          ))}
          {newDealDrafts.map((deal, index) => (
            <NewDealCard
              key={deal.id}
              deal={deal}
              index={partner.deals.length + index}
              onAddAnother={addDealDraft}
              onRemove={() =>
                setNewDealDrafts((current) =>
                  current.filter((draft) => draft.id !== deal.id),
                )
              }
              onSaved={() =>
                setNewDealDrafts((current) =>
                  current.filter((draft) => draft.id !== deal.id),
                )
              }
              onUpdate={(values) =>
                setNewDealDrafts((current) =>
                  current.map((draft) =>
                    draft.id === deal.id ? { ...draft, ...values } : draft,
                  ),
                )
              }
              partnerId={partnerId}
              visits={partner.visits}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-zinc-300 p-5 text-center text-sm text-zinc-600">
          No deals staged.
        </div>
      )}
      {partnerId ? (
        <button
          type="button"
          onClick={addDealDraft}
          className="h-10 rounded-md border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-800 transition hover:bg-teal-50"
        >
          Add deal
        </button>
      ) : null}
    </div>
  )

  if (embedded) {
    return (
      <FormSection title="Deals" defaultOpen={false} status={dealStatus}>
        {content}
      </FormSection>
    )
  }

  return (
    <EditorShell
      title="Deals"
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
  benefitCategory: string
  dealType: string
  expanded: boolean
  onToggle: () => void
  rewardSummary: string
  title: string
  typeLabel?: string
}) {
  const displayTypeLabel =
    typeLabel || labelForValue(dealUiTypeOptions, dealType) || "Deal"

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
  tone?: "neutral" | "active" | "muted"
}) {
  const toneClasses =
    tone === "active"
      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
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
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <DealCardHeader
        active={deal.active}
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
        title={`Deal ${index + 1}`}
        rewardSummary={deal.rewardSummary || deal.title || "Reward not set"}
        actions={
          <>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100"
          >
            {expanded ? "Collapse" : "Edit"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
          >
            Remove
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
  autoExpanded = false,
  deal,
  index,
  onAutoExpandedDismiss,
  partnerId,
  visits,
}: {
  autoExpanded?: boolean
  deal: Deal
  index: number
  onAutoExpandedDismiss?: () => void
  partnerId: string
  visits: Visit[]
}) {
  const [manuallyExpanded, setManuallyExpanded] = useState(false)
  const expanded = manuallyExpanded || autoExpanded
  const isLimitedDrop = deal.type === "limited_drop"
  const soldOut =
    isLimitedDrop &&
    isSoldOutDealDrop(deal.stock_total ?? null, deal.stock_remaining ?? null)

  const toggleExpanded = () => {
    if (expanded) {
      setManuallyExpanded(false)
      onAutoExpandedDismiss?.()
      return
    }

    setManuallyExpanded(true)
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <DealCardHeader
        active={deal.active ?? false}
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
        expanded={expanded}
        onToggle={toggleExpanded}
        title={`Deal ${index + 1}`}
        rewardSummary={formatDealRewardSummary(deal)}
        actions={
          <>
          <button
            type="button"
            onClick={toggleExpanded}
            className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100"
          >
            {expanded ? "Collapse" : "Edit"}
          </button>
          {deal.id ? (
            <DeleteDealForm
              dealId={deal.id}
              label="Remove"
              pendingLabel="Removing deal..."
              size="tiny"
              tone="outline"
            />
          ) : null}
          </>
        }
      />

      {soldOut ? (
        <div className="mt-4">
          <WarningNote>
            This Deal Drop is sold out and users cannot redeem it.
          </WarningNote>
        </div>
      ) : null}

      {expanded ? (
        <div className="mt-3 border-t border-zinc-200 pt-3">
          <DealForm
            deal={deal}
            partnerId={partnerId}
            mode="edit"
            visits={visits}
            onCancel={toggleExpanded}
          />
        </div>
      ) : null}
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
  const router = useRouter()

  useEffect(() => {
    if (state.ok) {
      onSaved?.()
      router.refresh()
    }
  }, [onSaved, router, state.ok])

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={deal?.id ?? ""} />
      <input type="hidden" name="partner_id" value={partnerId} />

      <DealFields
        deal={deal}
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
          label={mode === "create" ? "Add deal" : "Save deal"}
          pendingLabel={mode === "create" ? "Adding deal..." : "Saving deal..."}
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
    "The business trigger or campaign type, such as Happy Hour, Welcome reward, or Streak reward.",
  discountType:
    "What the user receives: percentage discount, fixed € amount, free item, bonus stamp, or 2-for-1.",
  benefitCategory:
    "Controls how the benefit is applied: user-selected, automatic background, or fallback if no deal is selected.",
  audience:
    "Who can use this benefit: free users, premium users, both, or free trial only.",
  activationRequired:
    "Whether the user must select this deal before scanning. This is automatically set by benefit category.",
  discountValue:
    "Only used for percent or fixed discounts. Percent means %, fixed means EUR.",
  rewardItem:
    "Name of the free item or reward staff should give, for example Free drink.",
  benefitCount: "Number of bonus stamps to add. Used for bonus stamp rewards.",
  estimatedSavings:
    "Approximate money value used for user savings stats and post-scan animation.",
  expiryDays: "How many days an earned reward remains valid.",
  triggerValue:
    "The condition threshold, such as streak days or challenge target.",
  challengeName:
    "Internal challenge name used to distinguish multiple challenge rewards.",
  durationValue:
    "Reward users who return within this configured duration.",
  inactivityValue:
    "Reward inactive users who have not returned for this configured time period.",
  stockTotal: "Total available stock for a limited deal drop.",
  stockRemaining: "How many redemptions are still available.",
  reserveOnSelection:
    "If enabled, stock is temporarily reserved when the user selects the deal.",
  validWindow: "Date/time range when this deal can be used.",
  happyHour: "Daily time window when the Happy Hour deal is available.",
  happyHourWeekdays:
    "Choose the days when this Happy Hour is available. If no days are selected, this Happy Hour applies every day.",
  cooldownHours:
    "Minimum time before the same user can use this deal again.",
  maxRedemptionsGlobal:
    "Maximum total times this deal can be redeemed by all users.",
  maxRedemptionsPerUser:
    "Maximum times each user can redeem this deal.",
  selectionExpiryMinutes:
    "How long the selected deal remains valid before the QR scan.",
  minSpend: "Minimum order value required to use this deal.",
  maxDiscountAmount: "Maximum discount cap for percentage discounts.",
  rewardTrackTarget:
    "Which reward track this applies to: base, premium, or all eligible.",
  timezone: "Timezone used for time-based deals like Happy Hour.",
  weekdays: "Days of week when this deal is available.",
  staffInstructions:
    "Shown to scanner/order staff so they know what to give or apply.",
  customerDescription: "Shown to users in the app.",
  terms: "Fine print or conditions for this deal.",
} as const

const dealExplanations: Record<string, DealTypeExplanation> = {
  two_for_one: {
    shortDescription:
      "User selects this before visiting to get two items for the price of one.",
    description:
      "A direct selectable deal where the user gets two items for the price of one. The user must select this before the QR scan. Only one direct deal can be used per visit.",
    recommendedSetup: [
      "Reward/effect type: 2-for-1",
      "Benefit category: User selects before visit",
      "Activation required: Yes",
    ],
    requiredFields: [
      "Audience",
      "Customer description",
      "Staff instructions",
      "Estimated savings",
      "Optional expiry or limits",
    ],
    example: "Buy one döner, get one döner free.",
    autoSet: [
      "type = two_for_one",
      "discount_type = 2for1",
      "benefit_category = direct_selectable",
      "activation_required = true",
    ],
  },
  welcome: {
    shortDescription:
      "First-visit reward. Can be selectable or automatic depending on reward type.",
    description:
      "A reward for a user’s first visit or first qualifying interaction with a partner. It can either be a selectable direct reward or an automatic bonus stamp.",
    recommendedSetup: [
      "If the reward is a bonus stamp: automatic background, no activation",
      "If the reward is a free item, discount, or 2-for-1: user selects before visit",
    ],
    requiredFields: [
      "Reward/effect type",
      "Audience",
      "Customer description",
      "Staff instructions",
      "Reward item, discount value, or bonus stamp count depending on reward type",
    ],
    example: "First visit: free drink or First visit: +1 bonus stamp.",
    autoSet: [
      "If discount_type = bonus_stamp: benefit_category = automatic_background; activation_required = false",
      "If discount_type = item/fixed/percent/2for1: benefit_category = direct_selectable; activation_required = true",
    ],
  },
  comeback: {
    shortDescription:
      "Reward for returning within a configured duration.",
    description:
      "Reward users who return within a configured duration. It can be automatic, such as +1 bonus stamp, or selectable, such as a free item.",
    recommendedSetup: [
      "If the reward is a bonus stamp: automatic background, no activation",
      "If the reward is a free item, discount, or 2-for-1: user selects before visit",
    ],
    requiredFields: [
      "Reward/effect type",
      "Duration value and unit",
      "Expiry days if the reward expires",
      "Customer description",
      "Staff instructions",
    ],
    example: "Come back within 72 hours and get +1 bonus stamp.",
    autoSet: [
      "metadata.bonus_mode = duration_bonus",
      "If discount_type = bonus_stamp: benefit_category = automatic_background; activation_required = false",
      "If discount_type = item/fixed/percent/2for1: benefit_category = direct_selectable; activation_required = true",
    ],
    important: "Save backend type as comeback, not duration_bonus.",
  },
  comeback_inactive: {
    shortDescription:
      "Reward inactive users who have not returned for a configured time period.",
    description:
      "Reward inactive users who have not returned for a configured time period. Useful for reactivation campaigns.",
    recommendedSetup: [
      "Configure inactivity and optional visit-count filters",
      "Use the candidate preview to confirm matching users",
      "Bonus stamp rewards apply automatically; item, discount, and 2-for-1 rewards are selectable",
    ],
    requiredFields: [
      "Inactivity period value and unit",
      "Reward/effect type",
      "Candidate filters if needed",
      "Customer description",
      "Staff instructions",
    ],
    example: "Users inactive for 3 weeks get a free drink.",
    autoSet: [
      "type = comeback",
      "metadata.bonus_mode = comeback_inactive",
      "If discount_type = bonus_stamp: benefit_category = automatic_background; activation_required = false",
      "If discount_type = item/fixed/percent/2for1: benefit_category = direct_selectable; activation_required = true",
    ],
    important: "Saved with backend type comeback and metadata.bonus_mode = comeback_inactive.",
  },
  happy_hour: {
    shortDescription: "Available only during the configured time window.",
    description:
      "A time-limited direct deal that is available only during a specific time window. The user selects it before the QR scan, and it is revalidated during redemption.",
    recommendedSetup: [
      "Benefit category: User selects before visit",
      "Activation required: Yes",
    ],
    requiredFields: [
      "Happy hour start",
      "Happy hour end",
      "Reward/effect type",
      "Discount value or reward item depending on reward type",
      "Customer description",
      "Staff instructions",
    ],
    example: "10% off between 15:00 and 18:00.",
    autoSet: [
      "type = happy_hour",
      "benefit_category = direct_selectable",
      "activation_required = true",
    ],
  },
  permanent_discount: {
    shortDescription:
      "Applies automatically only when no direct deal is selected.",
    description:
      "An automatic fallback discount. It applies only if the user did not select another direct deal. It does not stack with selected direct deals.",
    recommendedSetup: [
      "Reward/effect type: Percentage discount or Fixed € discount",
      "Benefit category: Applies only if no selected deal",
      "Activation required: No",
    ],
    requiredFields: [
      "Discount value",
      "Audience",
      "Customer description",
      "Staff instructions",
      "Estimated savings",
    ],
    example:
      "Premium users always get 5% off if they do not use another deal.",
    autoSet: [
      "type = permanent_discount",
      "benefit_category = automatic_fallback",
      "activation_required = false",
    ],
    important: "Display this as Permanent fallback discount, not just Permanent discount.",
  },
  limited_drop: {
    shortDescription: "Limited by time or stock. User selects before visiting.",
    description:
      "A limited-time or limited-stock direct deal. The user must select it before the QR scan. It can expire or sell out.",
    recommendedSetup: [
      "Benefit category: User selects before visit",
      "Activation required: Yes",
    ],
    requiredFields: [
      "Reward/effect type",
      "Stock total",
      "Stock remaining",
      "Valid from",
      "Valid until",
      "Customer description",
      "Staff instructions",
      "Estimated savings",
    ],
    example: "Only 50 free drinks available today.",
    autoSet: [
      "type = limited_drop",
      "benefit_category = direct_selectable",
      "activation_required = true",
    ],
  },
  birthday: {
    shortDescription:
      "Birthday reward. Can be selectable or automatic depending on reward type.",
    description:
      "A birthday reward. It can be a selectable direct reward or an automatic bonus stamp.",
    recommendedSetup: [
      "If the reward is a bonus stamp: automatic background, no activation",
      "If the reward is a free item, discount, or 2-for-1: user selects before visit",
    ],
    requiredFields: [
      "Reward/effect type",
      "Audience",
      "Reward item, discount value, or bonus stamp count depending on reward type",
      "Customer description",
      "Staff instructions",
    ],
    example: "Birthday week: free dessert.",
    autoSet: [
      "If discount_type = bonus_stamp: benefit_category = automatic_background; activation_required = false",
      "If discount_type = item/fixed/percent/2for1: benefit_category = direct_selectable; activation_required = true",
    ],
  },
  free_item: {
    shortDescription:
      "User selects this before visiting to receive a specific free item.",
    description:
      "A direct selectable deal where the user receives a specific free item. This requires the item name, not a discount value.",
    recommendedSetup: [
      "Reward/effect type: Free item",
      "Benefit category: User selects before visit",
      "Activation required: Yes",
    ],
    requiredFields: [
      "Free item name",
      "Customer description",
      "Staff instructions",
      "Estimated savings",
    ],
    example: "Free drink with your order.",
    autoSet: [
      "type = free_item",
      "discount_type = item",
      "benefit_category = direct_selectable",
      "activation_required = true",
    ],
    important: "Hide discount value for this deal type. Require reward_item.",
  },
  discount: {
    shortDescription:
      "User selects this before visiting. Does not stack with other direct deals.",
    description:
      "A normal discount deal that the user selects before visiting. This can be a percentage or fixed currency amount. It does not stack with other direct deals.",
    recommendedSetup: [
      "Reward/effect type: Percentage discount or Fixed € discount",
      "Benefit category: User selects before visit",
      "Activation required: Yes",
    ],
    requiredFields: [
      "Discount value",
      "Audience",
      "Customer description",
      "Staff instructions",
      "Estimated savings",
    ],
    example: "10% off or €5 off.",
    autoSet: [
      "type = discount",
      "benefit_category = direct_selectable",
      "activation_required = true",
    ],
    important: "Display this as Selectable discount, not just Discount.",
  },
  bonus_stamp: {
    shortDescription:
      "Adds extra stamps automatically during scan if eligible.",
    description:
      "An automatic background reward that adds extra stamps during redemption if eligible. Users do not select this manually.",
    recommendedSetup: [
      "Reward/effect type: Bonus stamp",
      "Benefit category: Applies automatically during scan",
      "Activation required: No",
    ],
    requiredFields: [
      "Number of bonus stamps",
      "Audience",
      "Customer description",
      "Optional staff instructions",
    ],
    example: "+1 bonus stamp today.",
    autoSet: [
      "type = bonus_stamp",
      "discount_type = bonus_stamp",
      "benefit_category = automatic_background",
      "activation_required = false",
    ],
    important: "Hide discount value. Require benefit_count.",
  },
  streak: {
    shortDescription: "Reward based on the user's streak with this partner.",
    description:
      "A reward based on the user’s streak with a partner. The reward can be a bonus stamp, free item, fixed discount, percentage discount, or 2-for-1.",
    recommendedSetup: [
      "Trigger value is required",
      "Bonus stamp rewards apply automatically",
      "Free item, discount, and 2-for-1 rewards are selected before visit",
    ],
    requiredFields: [
      "Trigger value",
      "Reward/effect type",
      "Benefit count, reward item, or discount value depending on reward type",
      "Expiry days if the earned reward expires",
      "Customer description",
      "Staff instructions",
    ],
    example: "3-day streak: free drink or 5-day streak: +1 bonus stamp.",
    autoSet: [
      "If discount_type = bonus_stamp: benefit_category = automatic_background; activation_required = false",
      "If discount_type = item/fixed/percent/2for1: benefit_category = direct_selectable; activation_required = true",
    ],
  },
  challenge: {
    shortDescription: "Reward connected to a challenge or goal.",
    description:
      "A reward connected to a challenge or goal. Depending on the reward effect, it can be automatic or selectable.",
    recommendedSetup: [
      "Challenge name identifies this challenge internally",
      "Bonus stamp rewards apply automatically",
      "Free item, discount, and 2-for-1 rewards are selected before visit",
      "Trigger value can be used as the challenge target",
    ],
    requiredFields: [
      "Challenge name",
      "Reward/effect type",
      "Trigger value if used as the challenge target",
      "Benefit count, reward item, or discount value depending on reward type",
      "Customer description",
      "Staff instructions",
    ],
    example: "Complete 3 visits this week and get a free drink.",
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
    visibleFields.add("estimatedSavings")
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
    messages.discountValue = "Enter a percentage between 1 and 100."
  }

  if (discountType === "fixed" && !parsedDiscountValue) {
    messages.discountValue = "Enter an amount greater than 0."
  }

  if (discountType === "percent" && parsedDiscountValue && parsedDiscountValue > 100) {
    messages.discountValue = "Enter a percentage between 1 and 100."
  }

  const parsedMinSpend = parseOptionalNumberInput(minSpend)
  if (
    discountType === "fixed" &&
    parsedMinSpend !== null &&
    parsedDiscountValue !== null &&
    parsedMinSpend < parsedDiscountValue
  ) {
    messages.minSpend =
      "Minimum spend is less than the discount amount — users may get more off than they spend."
  }

  if (discountType === "item" && !rewardItem.trim()) {
    messages.rewardItem = "Enter the free item name."
  }

  if (discountType === "bonus_stamp" && !parsedBenefitCount) {
    messages.benefitCount = "Enter at least 1 bonus stamp."
  }

  if (type === "happy_hour" && !happyHourStart) {
    messages.happyHourStart = "Enter a start time."
  }

  if (type === "happy_hour" && !happyHourEnd) {
    messages.happyHourEnd = "Enter an end time."
  }

  if (
    (type === "streak" || type === "challenge") &&
    !parsedTriggerValue
  ) {
    messages.triggerValue = "Enter a trigger value greater than 0."
  }

  if (type === "challenge" && !challengeName.trim()) {
    messages.challengeName = "Enter a challenge name."
  }

  if (
    (type === DURATION_BONUS_DEAL || type === "comeback") &&
    !parsedDurationValue
  ) {
    messages.durationValue = "Enter a duration greater than 0."
  }

  if (type === COMEBACK_INACTIVE_DEAL && !parsedInactivityValue) {
    messages.inactivityValue = "Enter an inactivity period greater than 0."
  }

  if (
    parsedMinVisitCount !== null &&
    parsedMaxVisitCount !== null &&
    parsedMaxVisitCount < parsedMinVisitCount
  ) {
    messages.visitCountRange = "Maximum visits must be at least minimum visits."
  }

  if (type === "limited_drop" && !endsAt) {
    messages.endsAt = "Limited Deal Drops must have an end time."
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
    return discountValue !== null ? `${discountValue}% off` : "percentage off"
  }

  if (discountType === "fixed") {
    return discountValue !== null ? `€${discountValue} off` : "fixed € off"
  }

  if (discountType === "item") {
    return rewardItem.trim() || "Free item"
  }

  if (discountType === "bonus_stamp") {
    const count = benefitCount ?? 1
    return `+${count} bonus ${count === 1 ? "stamp" : "stamps"}`
  }

  if (discountType === "2for1") {
    return "2-for-1"
  }

  return "No direct reward"
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
  const label = typeLabel || labelForValue(dealUiTypeOptions, type) || "Deal"
  const reward = formatDraftRewardSummary(
    discountType,
    discountValue,
    rewardItem,
    benefitCount,
  )

  return reward === "No direct reward" ? label : `${reward} - ${label}`
}

function DealFields({
  deal,
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
  prefix?: string
  defaultActive: boolean
  onDraftActiveChange?: (active: boolean) => void
  onDraftMetaChange?: (values: Partial<InitialDealDraft>) => void
  onDraftTypeChange?: (dealType: string) => void
  onDraftTitleChange?: (title: string) => void
  visits?: Visit[]
  useBrowserValidation?: boolean
}) {
  const initialDealType = dealUiTypeForDeal(deal)
  const initialBackendDealType = backendDealTypeForUi(initialDealType)
  const dealMetadata = metadataObject(deal?.metadata)
  const initialDiscountType =
    normalizeDiscountTypeForUi(initialBackendDealType, deal?.discount_type) ||
    defaultDiscountTypeForDealType(initialBackendDealType, "")
  const [selectedDealType, setSelectedDealType] = useState(initialDealType)
  const [selectedDiscountType, setSelectedDiscountType] =
    useState(initialDiscountType)
  const [selectedBenefitCategory, setSelectedBenefitCategory] = useState(
    deal?.benefit_category ??
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
    deal?.audience ?? DEFAULT_AUDIENCE,
  )
  const [active, setActive] = useState(defaultActive)
  const [discountValue, setDiscountValue] = useState(
    formatTextInputValue(deal?.discount_value),
  )
  const [rewardItem, setRewardItem] = useState(deal?.reward_item ?? "")
  const [rewardItemDirty, setRewardItemDirty] = useState(false)
  const [customerDescription, setCustomerDescription] = useState(
    deal?.customer_description ?? "",
  )
  const [customerDescriptionDirty, setCustomerDescriptionDirty] =
    useState(false)
  const [staffInstructions, setStaffInstructions] = useState(
    deal?.staff_instructions ?? "",
  )
  const [staffInstructionsDirty, setStaffInstructionsDirty] = useState(false)
  const [terms, setTerms] = useState(deal?.terms ?? "")
  const [termsDirty, setTermsDirty] = useState(false)
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
  const config = getDealFormConfig({
    type: selectedDealType,
    discountType: selectedDiscountType,
    benefitCategory: selectedBenefitCategory,
  })
  const selectedBackendDealType = backendDealTypeForUi(selectedDealType)
  const selectedDealTypeLabel =
    labelForValue(dealUiTypeOptions, selectedDealType) || "Deal"
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
        title="Basics"
        compact
        required="subtle"
      >
        <FieldGrid compact>
          <SelectField
            label="Deal type"
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
            label="Reward/effect type"
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
            label="Audience"
            name={`${prefix}audience`}
            value={selectedAudience}
            options={withCurrentOption(audienceOptions, deal?.audience)}
            onChange={setSelectedAudience}
            required
          />
          <CheckboxField
            label="Active"
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
            This Deal Drop is sold out and users cannot redeem it.
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

      {hasRewardDetails ? (
        <FormSection
          title="Reward details"
          compact
          required={rewardDetailsRequired ? "subtle" : undefined}
        >
          <FieldGrid compact>
            {config.visibleFields.has("challengeName") ? (
              <TextField
                label="Challenge name"
                name={`${prefix}challenge_name`}
                placeholder="3 visits this week"
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
                  label="Duration value"
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
                  label="Duration unit"
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
                label="Free item name"
                name={`${prefix}reward_item`}
                placeholder="Free drink"
                value={rewardItem}
                onChange={(value) => {
                  setRewardItemDirty(true)
                  setRewardItem(value)
                  emitDraftTitle({ rewardItemText: value })
                }}
                hint="Example: Free drink."
                required={
                  useBrowserValidation &&
                  config.requiredFields.has("rewardItem")
                }
                warning={validationMessages.rewardItem}
              />
            ) : null}
            {config.visibleFields.has("benefitCount") ? (
              <TextField
                label="Number of bonus stamps"
                name={`${prefix}benefit_count`}
                type="number"
                min={1}
                placeholder="1"
                value={benefitCount}
                onChange={(value) => {
                  setBenefitCount(value)
                  emitDraftTitle({ benefitCountText: value })
                }}
                hint="Example: 1 adds one extra stamp."
                required={
                  useBrowserValidation &&
                  config.requiredFields.has("benefitCount")
                }
                warning={validationMessages.benefitCount}
              />
            ) : null}
            {config.visibleFields.has("estimatedSavings") ? (
              <TextField
                label="Estimated savings (€)"
                name={`${prefix}estimated_savings`}
                type="number"
                step="any"
                min={0}
                value={estimatedSavings}
                onChange={setEstimatedSavings}
                hint="Used for savings stats and animations."
                recommended={isLimitedDrop}
              />
            ) : null}
            {config.visibleFields.has("happyHour") ? (
              <>
                <TextField
                  label="Happy hour start"
                  name={`${prefix}happy_hour_start`}
                  type="time"
                  value={happyHourStart}
                  onChange={setHappyHourStart}
                  hint="Daily start time."
                  required={
                    useBrowserValidation &&
                    config.requiredFields.has("happyHour")
                  }
                  warning={validationMessages.happyHourStart}
                />
                <TextField
                  label="Happy hour end"
                  name={`${prefix}happy_hour_end`}
                  type="time"
                  value={happyHourEnd}
                  onChange={setHappyHourEnd}
                  hint="Daily end time."
                  required={
                    useBrowserValidation &&
                    config.requiredFields.has("happyHour")
                  }
                  warning={validationMessages.happyHourEnd}
                />
                <WeekdayChipField
                  label="Happy Hour weekdays"
                  name={`${prefix}valid_weekdays`}
                  defaultValues={deal?.valid_weekdays}
                  hint={dealFieldHelp.happyHourWeekdays}
                />
              </>
            ) : null}
            {config.visibleFields.has("triggerValue") ? (
              <TextField
                label="Trigger value"
                name={`${prefix}trigger_value`}
                type="number"
                min={1}
                value={triggerValue}
                onChange={setTriggerValue}
                hint="Example: 3 for a 3-day streak."
                required={
                  useBrowserValidation &&
                  config.requiredFields.has("triggerValue")
                }
                warning={validationMessages.triggerValue}
              />
            ) : null}
            {config.visibleFields.has("expiryDays") ? (
              <TextField
                label="Expiry days"
                name={`${prefix}expiry_days`}
                type="number"
                min={0}
                value={expiryDays}
                onChange={setExpiryDays}
                hint="Optional expiry after reward is earned."
              />
            ) : null}
            {config.visibleFields.has("limitedWindow") ? (
              <>
                <TextField
                  label="Valid from"
                  name={`${prefix}starts_at`}
                  type="datetime-local"
                  value={startsAt}
                  onChange={setStartsAt}
                  hint={dealFieldHelp.validWindow}
                />
                <TextField
                  label="Valid until"
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
                label="Allow free user trial"
                name={`${prefix}allow_free_trial`}
                checked={allowFreeTrial}
                onChange={setAllowFreeTrial}
                hint="Free users can redeem this once using their global 2-for-1 trial."
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
        <FormSection title="Deal Drop card image" compact>
          <p className="text-xs leading-5 text-zinc-500">
            Upload a highlight image for the deal card (710×400px).
          </p>
          <MediaUploadField
            key={`deal-drop-image-${deal?.id ?? "new"}`}
            label="Deal Drop card image (710×400)"
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

      <AdvancedSettingsSection>
        <FieldGrid compact>
          {!isLimitedDrop ? (
            <>
              <TextField
                label="Valid from"
                name={`${prefix}valid_from`}
                type="datetime-local"
                value={validFrom}
                onChange={setValidFrom}
                hint={dealFieldHelp.validWindow}
              />
              <TextField
                label="Valid until"
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
                label="Max redemptions global"
                name={`${prefix}max_redemptions_global`}
                type="number"
                min={0}
                defaultValue={deal?.max_redemptions_global}
                hint={dealFieldHelp.maxRedemptionsGlobal}
              />
              <TextField
                label="Max redemptions per user"
                name={`${prefix}max_redemptions_per_user`}
                type="number"
                min={0}
                defaultValue={deal?.max_redemptions_per_user}
                hint={dealFieldHelp.maxRedemptionsPerUser}
              />
              <TextField
                label="Cooldown hours"
                name={`${prefix}cooldown_hours`}
                type="number"
                min={0}
                defaultValue={deal?.cooldown_hours}
                hint={dealFieldHelp.cooldownHours}
              />
            </>
          ) : null}
          <TextField
            label="Minimum spend"
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
            label="Max discount amount"
            name={`${prefix}max_discount_amount`}
            type="number"
            step="any"
            min={0}
            defaultValue={deal?.max_discount_amount}
            hint={dealFieldHelp.maxDiscountAmount}
          />
          <TextField
            label="Timezone"
            name={`${prefix}timezone`}
            defaultValue={deal?.timezone ?? DEFAULT_TIMEZONE}
            hint={dealFieldHelp.timezone}
          />
          {isLimitedDrop ? (
            <WeekdayChipField
              label="Valid weekdays"
              name={`${prefix}valid_weekdays`}
              defaultValues={deal?.valid_weekdays}
              hint={dealFieldHelp.weekdays}
            />
          ) : !isHappyHour ? (
            <MultiSelectField
              label="Weekdays"
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
  const audienceLabel = labelForValue(audienceOptions, audience) || "Audience not set"
  const accessLabel = formatPreviewAccessLabel(audience, trialEligible)

  return (
    <FormSection title="Live preview" defaultOpen={false} compact>
      <div className="max-w-md rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        {soldOut ? (
          <div className="mb-3">
            <WarningNote>
              This Deal Drop is sold out and users cannot redeem it.
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
          <Info label="Stock" value={stockState} />
          <Info label="Countdown" value={countdownState} />
          <Info
            label="Estimated savings"
            value={formatSavingsPreview(discountType, estimatedSavings)}
          />
          <Info label="Expiry" value={expiryInfo} />
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
  const [showNewMilestone, setShowNewMilestone] = useState(false)
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
      {showNewMilestone && partnerId ? (
        <DealFormShell title="Add milestone">
          <MilestoneForm partner={partner} mode="create" />
        </DealFormShell>
      ) : null}
      {partner.reward_milestones.length ? (
        <div className="space-y-3">
          {partner.reward_milestones.map((milestone) => (
            <MilestoneCard
              key={milestone.id ?? `${milestone.partner_id}-${milestone.required_stamps}`}
              milestone={milestone}
              partner={partner}
            />
          ))}
        </div>
      ) : (
        <EmptyState>No stamp-card milestones configured yet.</EmptyState>
      )}
      {partnerId ? (
        <button
          type="button"
          onClick={() => setShowNewMilestone((value) => !value)}
          className="h-10 rounded-md border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-800 transition hover:bg-teal-50"
        >
          {showNewMilestone ? "Hide form" : "Add milestone"}
        </button>
      ) : null}
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
  partner,
}: {
  milestone: PartnerRewardMilestone
  partner: PartnerWithDeals
}) {
  const [editing, setEditing] = useState(false)

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className="min-w-0 text-left"
          aria-expanded={editing}
        >
          <span className="block truncate text-sm font-semibold text-zinc-800">
            {milestone.title || milestone.reward_item || "Milestone reward"}
          </span>
          <span className="mt-1 block text-xs text-zinc-500">
            {formatOptionalNumber(milestone.required_stamps)} stamps -
            {" "}
            {labelForValue(rewardTypeOptions, milestone.reward_type)}
          </span>
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100"
          >
            {editing ? "Collapse" : "Edit"}
          </button>
          {milestone.id ? <DeleteMilestoneForm milestoneId={milestone.id} /> : null}
        </div>
      </div>
      {editing ? (
        <div className="mt-4 border-t border-zinc-200 pt-4">
          <MilestoneForm milestone={milestone} partner={partner} mode="edit" />
        </div>
      ) : null}
    </div>
  )
}

function MilestoneForm({
  milestone,
  partner,
  mode,
}: {
  milestone?: PartnerRewardMilestone
  partner: PartnerWithDeals
  mode: "create" | "edit"
}) {
  const [state, formAction] = useActionState(saveRewardMilestone, initialState)
  const [rewardType, setRewardType] = useState(
    milestone?.reward_type ?? "item",
  )
  const showsRewardItem = rewardType === "item"
  const showsDiscountValue = rewardType === "fixed" || rewardType === "percent"
  const showsBenefitCount = rewardType === "bonus_stamp"
  const requiredSectionsOpen = mode === "create"

  return (
    <form action={formAction} className="space-y-5">
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
            label="Reward type"
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
              label="Reward item"
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
      <FormSection title="Copy and Instructions" defaultOpen={false}>
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
  partner,
  users,
}: {
  partner: PartnerWithDeals
  users: OwnerOption[]
}) {
  const [showNewStaff, setShowNewStaff] = useState(partner.staff.length === 0)

  return (
    <EditorShell
      title="Partner staff and scanners"
      description="Authorize partner users as scanners or admins for this partner."
      collapsible
      defaultOpen={false}
    >
      <div className="space-y-4">
        {partner.id && !showNewStaff ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowNewStaff(true)}
              className="h-9 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white transition hover:bg-teal-800"
            >
              Add access
            </button>
          </div>
        ) : null}
        {showNewStaff ? (
          <DealFormShell title="Add scanner or admin">
            <PartnerStaffForm partner={partner} users={users} mode="create" />
          </DealFormShell>
        ) : null}
        {partner.staff.length ? (
          <div className="grid gap-4 2xl:grid-cols-2">
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

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <div>
        <div>
          <h3 className="text-base font-semibold tracking-normal text-zinc-950">
            {staff.user_name || staff.user_email || staff.user_id || "Staff user"}
          </h3>
          <p className="mt-1 text-sm text-zinc-600">
            {labelForValue(partnerStaffRoleOptions, staff.role)}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100"
        >
          {editing ? "Close editor" : "Edit access"}
        </button>
        {staff.id ? <DeletePartnerStaffForm staffId={staff.id} /> : null}
      </div>
      {editing ? (
        <div className="mt-4 border-t border-zinc-200 pt-4">
          <PartnerStaffForm
            partner={partner}
            staff={staff}
            users={users}
            mode="edit"
          />
        </div>
      ) : null}
    </div>
  )
}

function PartnerStaffForm({
  partner,
  staff,
  users,
  mode,
}: {
  partner: PartnerWithDeals
  staff?: PartnerStaff
  users: OwnerOption[]
  mode: "create" | "edit"
}) {
  const [state, formAction] = useActionState(savePartnerStaff, initialState)
  const userOptions = users.map((user) => ({
    value: user.id ?? user.uid ?? "",
    label:
      [user.display_name, user.email].filter(Boolean).join(" - ") ||
      user.id ||
      user.uid ||
      "Unnamed user",
  }))

  return (
    <form action={formAction} className="space-y-5">
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
}: {
  partner: PartnerWithDeals
  embedded?: boolean
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
          holidays={partner.holidays}
          hoursByWeekday={hoursByWeekday}
          partnerId={partnerId}
        />
      ) : null}
    </div>
  )

  if (embedded) {
    return (
      <FormSection title="Operating hours" defaultOpen={false} required="subtle">
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
  holidays,
  hoursByWeekday,
  partnerId,
}: {
  holidays: PartnerHoliday[]
  hoursByWeekday: Map<number | null, PartnerOpeningHour>
  partnerId: string
}) {
  const [state, formAction] = useActionState(
    saveWeeklyOpeningHours,
    initialState,
  )

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="partner_id" value={partnerId} />
      <WeeklyHoursFields holidays={holidays} hoursByWeekday={hoursByWeekday} />
      <ActionMessage state={state} />
      <SubmitButton
        label="Save operating hours"
        pendingLabel="Saving operating hours..."
      />
    </form>
  )
}

function WeeklyHoursFields({
  holidays = [],
  hoursByWeekday = new Map(),
}: {
  holidays?: PartnerHoliday[]
  hoursByWeekday?: Map<number | null, PartnerOpeningHour>
}) {
  const [bulkOpenTime, setBulkOpenTime] = useState("09:00")
  const [bulkCloseTime, setBulkCloseTime] = useState("18:00")
  const [bulkApplied, setBulkApplied] = useState(false)
  const [holidayInput, setHolidayInput] = useState("")
  const [holidayLabelInput, setHolidayLabelInput] = useState("")
  const [holidayError, setHolidayError] = useState("")
  const [holidayRows, setHolidayRows] = useState(() =>
    holidays
      .map((holiday) => ({
        date: normalizeHolidayDateInput(holiday.holiday_date),
        id: crypto.randomUUID(),
        label: holiday.label ?? "",
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
  const addHoliday = () => {
    const normalizedHoliday = normalizeHolidayDateInput(holidayInput)

    if (!normalizedHoliday) {
      setHolidayError("Choose a valid holiday date.")
      return
    }

    if (holidayRows.some((holiday) => holiday.date === normalizedHoliday)) {
      setHolidayError("That holiday is already listed.")
      return
    }

    setHolidayRows((current) =>
      [
        ...current,
        {
          date: normalizedHoliday,
          id: crypto.randomUUID(),
          label: holidayLabelInput.trim(),
        },
      ].sort((first, second) => first.date.localeCompare(second.date)),
    )
    setHolidayInput("")
    setHolidayLabelInput("")
    setHolidayError("")
  }

  useEffect(() => {
    if (!bulkApplied) {
      return
    }

    const timeout = window.setTimeout(() => setBulkApplied(false), 1400)

    return () => window.clearTimeout(timeout)
  }, [bulkApplied])

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
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
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
        <input type="hidden" name="holiday_count" value={holidayRows.length} />
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-zinc-700">Holiday closures</span>
            <input
              type="date"
              value={holidayInput}
              onChange={(event) => {
                setHolidayInput(event.target.value)
                if (holidayError) {
                  setHolidayError("")
                }
              }}
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-zinc-700">Holiday label</span>
            <input
              type="text"
              value={holidayLabelInput}
              maxLength={adminTextLimits.label}
              onChange={(event) => setHolidayLabelInput(event.target.value)}
              placeholder="Optional label"
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
            <CharacterCountNote
              current={holidayLabelInput.length}
              limit={adminTextLimits.label}
            />
          </label>
          <button
            type="button"
            onClick={addHoliday}
            className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 md:self-end"
          >
            Add holiday
          </button>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Use the calendar picker to add full-day holiday closures. Labels are
          optional and help explain special closures.
        </p>
        {holidayError ? (
          <p className="mt-3 text-xs font-medium text-rose-700">
            {holidayError}
          </p>
        ) : null}
        {holidayRows.length ? (
          <div className="mt-4 grid gap-3">
            {holidayRows.map((holiday, index) => (
              <div
                key={holiday.id}
                className="rounded-md border border-zinc-200 bg-white p-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <input
                      type="hidden"
                      name={`holiday_${index}_date`}
                      value={holiday.date}
                    />
                    <p className="text-sm font-semibold text-zinc-900">
                      {formatHolidayDateLabel(holiday.date)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Full-day closure
                    </p>
                  </div>
                  <label className="min-w-0 flex-1 space-y-2 text-sm">
                    <span className="font-medium text-zinc-700">
                      Label
                    </span>
                    <input
                      type="hidden"
                      name={`holiday_${index}_label`}
                      value={holiday.label}
                    />
                    <input
                      type="text"
                      value={holiday.label}
                      maxLength={adminTextLimits.label}
                      onChange={(event) =>
                        setHolidayRows((current) =>
                          current.map((row) =>
                            row.id === holiday.id
                              ? { ...row, label: event.target.value }
                              : row,
                          ),
                        )
                      }
                      placeholder="Optional label"
                      className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                    />
                    <CharacterCountNote
                      current={holiday.label.length}
                      limit={adminTextLimits.label}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setHolidayRows((current) =>
                        current.filter((row) => row.id !== holiday.id),
                      )
                    }
                    className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">
            No holiday closures added yet.
          </p>
        )}
      </div>
      <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
        <div className="min-w-[42rem] divide-y divide-zinc-100">
          {openingWeekdayOptions.map((day) => {
            const hour = weeklyHours[day.value]

            return (
              <div
                key={day.value}
                className="grid grid-cols-[8rem_7rem_1fr_1fr_1.25fr] items-center gap-3 px-3 py-3 text-sm"
              >
                <p className="font-semibold text-zinc-900">{day.label}</p>
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    name={`is_closed_${day.value}`}
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
                  name={`opens_at_${day.value}`}
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
                  name={`closes_at_${day.value}`}
                  type="time"
                  required={!hour.isClosed}
                  value={hour.isClosed ? "" : hour.closesAt}
                  disabled={hour.isClosed}
                  onChange={(event) =>
                    updateWeeklyHour(day.value, { closesAt: event.target.value })
                  }
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />
                <div className="space-y-1">
                  <input
                    aria-label={`${day.label} note`}
                    name={`label_${day.value}`}
                    placeholder="Optional note"
                    value={hour.label}
                    maxLength={adminTextLimits.label}
                    onChange={(event) =>
                      updateWeeklyHour(day.value, { label: event.target.value })
                    }
                    className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  />
                  <CharacterCountNote
                    current={hour.label.length}
                    limit={adminTextLimits.label}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
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
          partnerEmail={partner.email}
          partnerId={partnerId}
          partnerName={partner.name}
        />
      ) : (
        <EmptyState>No menu configured yet.</EmptyState>
      )}
    </div>
  )

  if (embedded) {
    return (
      <FormSection title="Menu" defaultOpen={false}>
        {content}
      </FormSection>
    )
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
  partnerEmail,
  partnerId,
  partnerName,
}: {
  menu: PartnerMenu
  partnerEmail?: string | null
  partnerId: string
  partnerName?: string | null
}) {
  const [editingMenu, setEditingMenu] = useState(false)
  const [showNewCategory, setShowNewCategory] = useState(menu.categories.length === 0)
  const [showNewItem, setShowNewItem] = useState(menu.items.length === 0)
  const [categoryOrderIds, setCategoryOrderIds] = useState<string[]>([])
  const [itemOrderIds, setItemOrderIds] = useState<string[]>([])
  const [autoEditingCategoryIds, setAutoEditingCategoryIds] = useState<string[]>([])
  const [autoEditingItemIds, setAutoEditingItemIds] = useState<string[]>([])
  const [draggedCategoryId, setDraggedCategoryId] = useState("")
  const [draggedItemId, setDraggedItemId] = useState("")
  const [reorderMessage, setReorderMessage] = useState("")
  const [isReordering, startReorderTransition] = useTransition()
  const knownCategoryIdsRef = useRef<Set<string> | null>(null)
  const knownItemIdsRef = useRef<Set<string> | null>(null)
  const knownMenuIdRef = useRef("")
  const categoryCards = applyLocalSortOrder(
    sortMenuCategories(menu.categories),
    categoryOrderIds,
  )
  const itemCards = applyLocalSortOrder(sortMenuItems(menu.items), itemOrderIds)
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

  useEffect(() => {
    const menuId = menu.id ?? ""
    const currentCategoryIds = menu.categories
      .map((category) => category.id)
      .filter((id): id is string => Boolean(id))
    const currentItemIds = menu.items
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id))

    if (knownMenuIdRef.current !== menuId) {
      knownMenuIdRef.current = menuId
      knownCategoryIdsRef.current = new Set(currentCategoryIds)
      knownItemIdsRef.current = new Set(currentItemIds)
      setAutoEditingCategoryIds([])
      setAutoEditingItemIds([])
      return
    }

    const knownCategoryIds =
      knownCategoryIdsRef.current ?? new Set(currentCategoryIds)
    const knownItemIds = knownItemIdsRef.current ?? new Set(currentItemIds)
    const newCategoryIds = currentCategoryIds.filter(
      (id) => !knownCategoryIds.has(id),
    )
    const newItemIds = currentItemIds.filter((id) => !knownItemIds.has(id))

    if (newCategoryIds.length) {
      setAutoEditingCategoryIds((current) =>
        Array.from(new Set([...current, ...newCategoryIds])),
      )
    }

    if (newItemIds.length) {
      setAutoEditingItemIds((current) =>
        Array.from(new Set([...current, ...newItemIds])),
      )
    }

    knownCategoryIdsRef.current = new Set(currentCategoryIds)
    knownItemIdsRef.current = new Set(currentItemIds)
  }, [menu.categories, menu.id, menu.items])

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
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-950">
            {menu.name || "Untitled menu"}
          </h3>
          <p className="mt-1 text-sm text-zinc-600">
            {menu.description || "No description"}
          </p>
        </div>
        <Badge className="inline-flex min-w-[10.5rem] items-center justify-center whitespace-nowrap">
          Menu status: {labelForValue(menuStatusOptions, menu.status)}
        </Badge>
      </div>
      {menu.status === "review" ? (
        <MenuApprovalNotice
          menuId={menu.id}
          menuName={menu.name}
          partnerEmail={partnerEmail}
          partnerName={partnerName}
        />
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2 text-sm text-zinc-600">
        <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 py-2">
          <span className="font-medium text-zinc-800">Categories:</span>
          <span>{menu.categories.length}</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 py-2">
          <span className="font-medium text-zinc-800">Items:</span>
          <span>{menu.items.length}</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 py-2">
          <span className="font-medium text-zinc-800">Updated:</span>
          <span>{formatDateTime(menu.updated_at)}</span>
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setEditingMenu((value) => !value)}
          className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100"
        >
          {editingMenu ? "Close editor" : "Edit menu"}
        </button>
        {menu.id ? <DeleteMenuForm menuId={menu.id} /> : null}
      </div>
      {editingMenu ? (
        <div className="mt-4 border-t border-zinc-200 pt-4">
          <MenuForm menu={menu} partnerId={partnerId} />
        </div>
      ) : null}
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
        <p className="mt-3 text-xs font-medium text-zinc-500">
          Saving order...
        </p>
      ) : null}

      <div className="mt-5 space-y-3 border-t border-zinc-200 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-zinc-900">Categories</h4>
          <button
            type="button"
            onClick={() => setShowNewCategory((value) => !value)}
            className="h-8 rounded-md border border-teal-700 bg-white px-3 text-xs font-semibold text-teal-800 transition hover:bg-teal-50"
          >
            {showNewCategory ? "Hide form" : "Add category"}
          </button>
        </div>
        {showNewCategory && menu.id ? (
          <DealFormShell title="Add category">
            <MenuCategoryForm
              defaultSortOrder={nextCategorySortOrder}
              menuId={menu.id}
              onSaved={() => setShowNewCategory(false)}
            />
          </DealFormShell>
        ) : null}
        {categoryCards.length ? (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
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
                  autoEditing={Boolean(
                    category.id && autoEditingCategoryIds.includes(category.id),
                  )}
                  category={category}
                  menuId={menu.id ?? ""}
                  onAutoEditingDismiss={() =>
                    setAutoEditingCategoryIds((current) =>
                      current.filter((id) => id !== category.id),
                    )
                  }
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
            onClick={() => setShowNewItem((value) => !value)}
            className="h-8 rounded-md border border-teal-700 bg-white px-3 text-xs font-semibold text-teal-800 transition hover:bg-teal-50"
          >
            {showNewItem ? "Hide form" : "Add item"}
          </button>
        </div>
        {showNewItem && menu.id ? (
          <DealFormShell title="Add menu item">
            <MenuItemForm
              categoryOptions={categoryOptions}
              defaultSortOrder={nextItemSortOrder}
              menuId={menu.id}
              onSaved={() => setShowNewItem(false)}
            />
          </DealFormShell>
        ) : null}
        {itemCards.length ? (
          <div className="max-h-[46rem] overflow-y-auto pr-2">
            <div className="grid gap-4 2xl:grid-cols-2">
              {itemCards.map((item) => (
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
                    autoEditing={Boolean(
                      item.id && autoEditingItemIds.includes(item.id),
                    )}
                    categoryOptions={categoryOptions}
                    item={item}
                    menuId={menu.id ?? ""}
                    onAutoEditingDismiss={() =>
                      setAutoEditingItemIds((current) =>
                        current.filter((id) => id !== item.id),
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState>No menu items configured yet.</EmptyState>
        )}
      </div>
    </div>
  )
}

function MenuApprovalNotice({
  menuId,
  menuName,
  partnerEmail,
  partnerName,
}: {
  menuId?: string | null
  menuName?: string | null
  partnerEmail?: string | null
  partnerName?: string | null
}) {
  const [state, formAction] = useActionState(approveMenu, initialState)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback, setFeedback] = useState("")
  const subject = `Menu feedback for ${partnerName || "your Benefitsi listing"}`
  const body = [
    `Hi ${partnerName || "there"},`,
    "",
    `We reviewed ${menuName || "your menu"} and need a few changes before approval:`,
    "",
    feedback || "[Add feedback here]",
    "",
    "Thanks,",
    "Benefitsi Admin",
  ].join("\n")
  const mailtoHref = partnerEmail
    ? `mailto:${partnerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : ""

  return (
    <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-900">
            Menu requires approval
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-900">
            Approve this menu now, or request changes from the partner.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={formAction}>
            <input type="hidden" name="id" value={menuId ?? ""} />
            <SubmitButton
              label="Approve"
              pendingLabel="Approving..."
              size="compact"
            />
          </form>
          <button
            type="button"
            onClick={() => setShowFeedback((value) => !value)}
            className="h-9 rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
          >
            Provide feedback
          </button>
        </div>
      </div>
      <ActionMessage state={state} />
      {showFeedback ? (
        <div className="mt-3 space-y-3">
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="Write requested menu changes here before emailing."
            className="min-h-24 w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          />
          {partnerEmail ? (
            <a
              className="inline-flex h-9 items-center justify-center rounded-md bg-amber-700 px-3 text-sm font-semibold text-white transition hover:bg-amber-800"
              href={mailtoHref}
            >
              Email feedback
            </a>
          ) : (
            <span className="inline-flex rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900">
              No partner email
            </span>
          )}
        </div>
      ) : null}
    </div>
  )
}

function MenuForm({
  menu,
  partnerId,
}: {
  menu?: PartnerMenu
  partnerId: string
}) {
  const [state, formAction] = useActionState(saveMenu, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={menu?.id ?? ""} />
      <input type="hidden" name="partner_id" value={partnerId} />
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
          defaultValue={menu?.status ?? "draft"}
          options={withCurrentOption(menuStatusOptions, menu?.status)}
          required
        />
      </FieldGrid>
      <TextAreaField
        label="Description"
        name="description"
        defaultValue={menu?.description}
      />
      <ActionMessage state={state} />
      <SubmitButton
        label={menu ? "Save menu" : "Add menu"}
        pendingLabel={menu ? "Saving menu..." : "Adding menu..."}
      />
    </form>
  )
}

function DeleteMenuForm({ menuId }: { menuId: string }) {
  const [state, formAction] = useActionState(deleteMenu, initialState)

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Delete this menu and its categories/items?")) {
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

function MenuCategoryCard({
  autoEditing = false,
  category,
  menuId,
  onAutoEditingDismiss,
}: {
  autoEditing?: boolean
  category: MenuCategory
  menuId: string
  onAutoEditingDismiss?: () => void
}) {
  const [manuallyEditing, setManuallyEditing] = useState(false)
  const editing = manuallyEditing || autoEditing

  const closeEditor = () => {
    setManuallyEditing(false)
    onAutoEditingDismiss?.()
  }

  const toggleEditor = () => {
    if (editing) {
      closeEditor()
      return
    }

    setManuallyEditing(true)
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h5 className="text-sm font-semibold text-zinc-950">
            {category.name || "Untitled category"}
          </h5>
          <p className="mt-1 text-xs text-zinc-500">
            {category.items.length} {category.items.length === 1 ? "item" : "items"}
          </p>
        </div>
        <Badge>
          {category.items.length} {category.items.length === 1 ? "item" : "items"}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={toggleEditor}
          className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100"
        >
          {editing ? "Close editor" : "Edit category"}
        </button>
        {category.id ? <DeleteMenuCategoryForm categoryId={category.id} /> : null}
      </div>
      {editing ? (
        <div className="mt-3 border-t border-zinc-200 pt-3">
          <MenuCategoryForm
            category={category}
            menuId={menuId}
            onSaved={closeEditor}
          />
        </div>
      ) : null}
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
  onSaved?: () => void
}) {
  const [state, formAction] = useActionState(saveMenuCategory, initialState)
  const router = useRouter()

  useEffect(() => {
    if (state.ok) {
      onSaved?.()
      router.refresh()
    }
  }, [onSaved, router, state.ok])

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={category?.id ?? ""} />
      <input type="hidden" name="menu_id" value={menuId} />
      <FieldGrid>
        <TextField
          label="Name"
          name="name"
          defaultValue={category?.name}
          required
        />
        <TextField
          label="Position in menu"
          name="sort_order"
          type="number"
          min={0}
          hint="Smaller numbers appear first."
          defaultValue={category?.sort_order ?? defaultSortOrder}
        />
      </FieldGrid>
      <ActionMessage state={state} />
      <SubmitButton
        label={category ? "Save category" : "Add category"}
        pendingLabel={category ? "Saving category..." : "Adding category..."}
      />
    </form>
  )
}

function DeleteMenuCategoryForm({ categoryId }: { categoryId: string }) {
  const [state, formAction] = useActionState(deleteMenuCategory, initialState)

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Delete this menu category?")) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="id" value={categoryId} />
      <ActionMessage state={state} />
      <SubmitButton
        label="Delete"
        pendingLabel="Deleting category..."
        size="tiny"
        tone="danger"
      />
    </form>
  )
}

function MenuItemCard({
  autoEditing = false,
  categoryOptions,
  item,
  menuId,
  onAutoEditingDismiss,
}: {
  autoEditing?: boolean
  categoryOptions: { value: string; label: string }[]
  item: MenuItem
  menuId: string
  onAutoEditingDismiss?: () => void
}) {
  const [manuallyEditing, setManuallyEditing] = useState(false)
  const editing = manuallyEditing || autoEditing

  const closeEditor = () => {
    setManuallyEditing(false)
    onAutoEditingDismiss?.()
  }

  const toggleEditor = () => {
    if (editing) {
      closeEditor()
      return
    }

    setManuallyEditing(true)
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
        <ImagePreview
          alt={`${item.name || "Menu item"} picture`}
          src={item.image_url ?? undefined}
          spec={partnerMediaSpecs.menuItem}
        />
        <div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h5 className="text-sm font-semibold text-zinc-950">
                {item.name || "Untitled item"}
              </h5>
              <p className="mt-1 text-xs text-zinc-500">
                {labelForValue(categoryOptions, item.category_id) ||
                  "No category"}
              </p>
            </div>
            <Badge>{formatPrice(item.price, item.currency)}</Badge>
          </div>
          <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-600">
            {truncateText(item.description ?? "", 140) || "No description"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.is_popular ? <Badge>Popular</Badge> : null}
            {item.tags?.map((tag) => <Badge key={tag}>{tag}</Badge>)}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={toggleEditor}
          className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100"
        >
          {editing ? "Close editor" : "Edit item"}
        </button>
        {item.id ? <DeleteMenuItemForm itemId={item.id} /> : null}
      </div>
      {editing ? (
        <div className="mt-3 border-t border-zinc-200 pt-3">
          <MenuItemForm
            categoryOptions={categoryOptions}
            item={item}
            menuId={menuId}
            onSaved={closeEditor}
          />
        </div>
      ) : null}
    </div>
  )
}

function MenuItemForm({
  categoryOptions,
  defaultSortOrder = 0,
  item,
  menuId,
  onSaved,
}: {
  categoryOptions: { value: string; label: string }[]
  defaultSortOrder?: number
  item?: MenuItem
  menuId: string
  onSaved?: () => void
}) {
  const [state, formAction] = useActionState(saveMenuItem, initialState)
  const router = useRouter()

  useEffect(() => {
    if (state.ok) {
      onSaved?.()
      router.refresh()
    }
  }, [onSaved, router, state.ok])

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={item?.id ?? ""} />
      <input type="hidden" name="menu_id" value={menuId} />
      {item?.is_stamp_eligible ? (
        <input type="hidden" name="is_stamp_eligible" value="on" />
      ) : null}
      <FieldGrid>
        <TextField
          label="Item name"
          name="name"
          defaultValue={item?.name}
          required
        />
        <SelectField
          label="Category"
          name="category_id"
          defaultValue={item?.category_id}
          options={withCurrentOption(categoryOptions, item?.category_id)}
        />
        <TextField
          label="Price"
          name="price"
          type="number"
          step="0.01"
          defaultValue={item?.price}
        />
        <TextField
          label="Currency"
          name="currency"
          defaultValue={item?.currency ?? "EUR"}
        />
        <TextField
          label="Position in category"
          name="sort_order"
          type="number"
          min={0}
          hint="Smaller numbers appear first."
          defaultValue={item?.sort_order ?? defaultSortOrder}
        />
        <TextField
          label="Tags"
          name="tags"
          defaultValue={item?.tags?.join(", ")}
          hint="Separate tags with commas."
        />
        <TextField
          label="Allergens"
          name="allergens"
          defaultValue={item?.allergens?.join(", ")}
          hint="Separate allergens with commas."
        />
      </FieldGrid>
      <TextAreaField
        label="Description"
        name="description"
        defaultValue={item?.description}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckboxField
          label="Popular"
          name="is_popular"
          defaultChecked={item?.is_popular ?? false}
        />
      </div>
      <MediaUploadField
        key={`menu-item-${item?.image_url ?? item?.id ?? "new"}`}
        label="Menu item picture"
        fileName="image_file"
        existingName="existing_image_url"
        removeName="remove_image"
        currentUrl={item?.image_url}
        spec={partnerMediaSpecs.menuItem}
        compact
      />
      <ActionMessage state={state} />
      <SubmitButton
        label={item ? "Save item" : "Add item"}
        pendingLabel={item ? "Saving item..." : "Adding item..."}
      />
    </form>
  )
}

function DeleteMenuItemForm({ itemId }: { itemId: string }) {
  const [state, formAction] = useActionState(deleteMenuItem, initialState)

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Delete this menu item?")) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="id" value={itemId} />
      <ActionMessage state={state} />
      <SubmitButton
        label="Delete"
        pendingLabel="Deleting item..."
        size="tiny"
        tone="danger"
      />
    </form>
  )
}

function StampProgressPanel({ progress }: { progress: StampCardProgress[] }) {
  const visibleProgress = progress.slice(0, stampProgressDisplayLimit)

  return (
    <EditorShell
      title="Stamp-card progress"
      description={`Progress comes from stamp_cards_progress_view. MVP cards complete at ${MAX_STAMP_CARD_STAMPS} stamps.`}
      collapsible
      defaultOpen={false}
    >
      {progress.length ? (
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
      )}
    </EditorShell>
  )
}

function RedemptionHistoryPanel({
  partner,
  visits,
}: {
  partner: PartnerWithDeals
  visits: Visit[]
}) {
  const visibleVisits = visits.slice(0, redemptionHistoryDisplayLimit)

  return (
    <EditorShell
      title="Redemption history"
      description="Visits can contain multiple applied benefits; the server decides the full reward bundle."
      collapsible
      defaultOpen={false}
    >
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
                    className="rounded-md border border-zinc-200 bg-zinc-50 p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-zinc-950">
                          Visit {shortId(visit.id)}
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
                                  value={
                                    benefit.benefit_category || "Not set"
                                  }
                                />
                                <Info
                                  label="Discount"
                                  value={formatRewardValue(
                                    benefit.discount_type,
                                    benefit.discount_value,
                                  )}
                                />
                                <Info
                                  label="Reward item"
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
                                  value={benefit.source_type || "Not set"}
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
  const formRef = useRef<HTMLFormElement>(null)
  const confirmedSubmitRef = useRef(false)
  const router = useRouter()

  useEffect(() => {
    if (!state.ok) {
      return
    }

    onDeleted()
    router.refresh()
  }, [onDeleted, router, state.ok])

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
      <ActionMessage state={state} />
      <SubmitButton
        label="Delete partner"
        pendingLabel="Deleting partner..."
        tone="danger"
      />
      <ConfirmDialog
        open={confirmingDelete}
        title="Delete partner?"
        description={`This will permanently delete ${partner.name || "this partner"} and all attached deals.`}
        confirmLabel="Delete partner"
        tone="danger"
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          confirmedSubmitRef.current = true
          setConfirmingDelete(false)
          formRef.current?.requestSubmit()
        }}
      />
    </form>
  )
}

function DeleteDealForm({
  dealId,
  label = "Delete",
  pendingLabel = "Deleting deal...",
  size = "compact",
  tone = "danger",
}: {
  dealId: string
  label?: string
  pendingLabel?: string
  size?: "compact" | "tiny"
  tone?: "danger" | "outline"
}) {
  const [state, formAction] = useActionState(deleteDeal, initialState)

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Delete this deal?")) {
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

function DeleteMilestoneForm({ milestoneId }: { milestoneId: string }) {
  const [state, formAction] = useActionState(
    deleteRewardMilestone,
    initialState,
  )

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Delete this milestone?")) {
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

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Remove this staff access?")) {
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
      className={`rounded-md border border-zinc-200 bg-white text-sm ${
        compact ? "p-2.5" : "p-3"
      }`}
    >
      {collapsible ? (
        <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
          <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 outline-none transition hover:text-zinc-700 focus-visible:ring-2 focus-visible:ring-teal-100 [&::-webkit-details-marker]:hidden">
            <span
              className={`flex items-center gap-2 ${compact ? "min-h-7" : "min-h-8"}`}
            >
              <span>{title}</span>
              {sectionStatus ? <SectionStatusList status={sectionStatus} /> : null}
              <span className="ml-auto text-xs font-semibold normal-case tracking-normal text-zinc-500">
                {open ? "Collapse" : "Expand"}
              </span>
            </span>
          </summary>
          <div
            className={`border-t border-zinc-100 ${
              compact ? "mt-3 space-y-3 pt-3" : "mt-4 space-y-4 pt-4"
            }`}
          >
            {children}
          </div>
        </details>
      ) : (
        <>
          <div className={`flex items-center gap-2 ${compact ? "min-h-7" : "min-h-8"}`}>
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              {title}
            </span>
            {sectionStatus ? <SectionStatusList status={sectionStatus} /> : null}
          </div>
          <div
            className={`border-t border-zinc-100 ${
              compact ? "mt-3 space-y-3 pt-3" : "mt-4 space-y-4 pt-4"
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
      className={`grid md:grid-cols-2 2xl:grid-cols-3 ${
        compact ? "gap-3" : "gap-4"
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
    <label className="block space-y-2 text-sm">
      <FieldLabel label={label} required={required} recommended={recommended} />
      <div
        className={`flex h-10 w-full items-center rounded-md border border-zinc-300 bg-white text-sm text-zinc-950 transition focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-100 ${
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
        maxLength={resolvedMaxLength}
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
    <label className="block space-y-2 text-sm">
      <FieldLabel label={label} required={required} />
      <select
        name={name}
        required={required}
        value={value}
        defaultValue={value === undefined ? defaultValue ?? "" : undefined}
        onChange={(event) => onChange?.(event.target.value)}
        className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
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
  const selectedLabels = selectedValues.length
    ? selectedValues.join(", ")
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
    <div className="space-y-2 text-sm">
      <FieldLabel label={label} required={required} />
      <details
        ref={detailsRef}
        className="relative"
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary
          className="flex min-h-10 cursor-pointer list-none items-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
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
  onPreviewChange,
}: {
  label: string
  fileName: string
  existingName: string
  removeName: string
  currentUrl?: string | null
  spec: PartnerMediaSpec
  compact?: boolean
  onPreviewChange?: (url: string) => void
}) {
  const [removed, setRemoved] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [selectedPreviews, setSelectedPreviews] = useState<ImagePreview[]>([])
  const [uploadMessage, setUploadMessage] = useState("")
  const [uploadError, setUploadError] = useState("")
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

  return (
    <div className="flex h-full flex-col gap-2 rounded-md border border-zinc-200 p-2 text-sm">
      <div className="space-y-1">
        <p className="font-medium text-zinc-700">{label}</p>
        <p className="text-xs text-zinc-500">
          {sizeHint}. Images are resized automatically before upload. Max 10 MB.
        </p>
      </div>
      {currentUrl && !removed ? (
        <input type="hidden" name={existingName} value={currentUrl} />
      ) : null}
      <div
        className={`flex items-center justify-center rounded-md bg-zinc-50/60 p-2 ${
          compact ? "min-h-[8rem]" : "min-h-[220px]"
        }`}
      >
        {selectedPreview ? (
          <ImagePreview
            alt={selectedPreview.name}
            src={selectedPreview.url}
            spec={spec}
            selected
            onRemove={clearSelectedMedia}
            removeLabel={`Remove ${label}`}
          />
        ) : showCurrent ? (
          <ImagePreview
            alt={`${label} preview`}
            src={currentUrl ?? ""}
            spec={spec}
            onRemove={() => setRemoved(true)}
            removeLabel={`Remove ${label}`}
          />
        ) : (
          <ImagePreview alt={`${label} upload placeholder`} spec={spec} />
        )}
      </div>
      <div className="min-h-9">
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
      <div className="mt-auto space-y-2">
        <input
          ref={fileInputRef}
          name={fileName}
          type="file"
          accept={partnerMediaAccept}
          onChange={async (event) => {
            const input = event.currentTarget
            const files = Array.from(input.files ?? [])

            if (files.length === 0) {
              replaceFileInputFiles(input, selectedFiles)
              return
            }

            setUploadError("")
            setUploadMessage("Resizing image...")

            try {
              const resizedFiles = await resizeImageFiles(files, spec)
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
            }
          }}
          className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-teal-700 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-teal-800"
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

function CoverUploadField({ covers }: { covers?: string[] | null }) {
  const [removedUrls, setRemovedUrls] = useState<string[]>([])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [selectedPreviews, setSelectedPreviews] = useState<ImagePreview[]>([])
  const [uploadMessage, setUploadMessage] = useState("")
  const [uploadError, setUploadError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedPreviewsRef = useRef<ImagePreview[]>([])
  const coverUrls = normalizeMediaUrls(covers)
  const visibleCovers = coverUrls.filter(
    (coverUrl) => !removedUrls.includes(coverUrl),
  )
  const removedCovers = coverUrls.filter((coverUrl) =>
    removedUrls.includes(coverUrl),
  )
  const hasSelectedPreviews = selectedPreviews.length > 0
  const hasVisibleCovers = visibleCovers.length > 0
  const spec = partnerMediaSpecs.cover
  const sizeHint = mediaSizeHint(spec)
  const availableCoverSlots = Math.max(maxCoverPhotos - visibleCovers.length, 0)
  const remainingCoverSlots = Math.max(
    maxCoverPhotos - visibleCovers.length - selectedPreviews.length,
    0,
  )

  useEffect(() => {
    selectedPreviewsRef.current = selectedPreviews
  }, [selectedPreviews])

  useEffect(() => () => revokeImagePreviews(selectedPreviewsRef.current), [])

  const replaceSelectedCovers = (files: File[], previews: ImagePreview[]) => {
    setSelectedFiles(files)
    setSelectedPreviews((current) => {
      revokeImagePreviews(current)
      return previews
    })
  }

  const removeSelectedCover = (index: number) => {
    const nextFiles = selectedFiles.filter((_, fileIndex) => fileIndex !== index)
    const nextPreviews = selectedPreviews.filter(
      (_, previewIndex) => previewIndex !== index,
    )

    if (fileInputRef.current) {
      replaceFileInputFiles(fileInputRef.current, nextFiles)
    }

    replaceSelectedCovers(nextFiles, nextPreviews)
    if (nextFiles.length === 0) {
      setUploadMessage("")
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-2 text-sm">
      <p className="font-medium text-zinc-700">Cover photos</p>
      <p className="text-xs text-zinc-500">
        {sizeHint}. Images are resized automatically before upload. Max{" "}
        {maxCoverPhotos} cover photos, 10 MB each.
      </p>
      <p className="text-xs font-medium text-zinc-500">
        {visibleCovers.length} of {maxCoverPhotos} cover photos saved
        {remainingCoverSlots ? `; ${remainingCoverSlots} slot${remainingCoverSlots === 1 ? "" : "s"} available.` : "."}
      </p>
      {hasVisibleCovers || hasSelectedPreviews ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCovers.map((coverUrl) => (
            <div key={coverUrl} className="space-y-2">
              <input
                type="hidden"
                name="existing_cover_urls"
                value={coverUrl}
              />
              <ImagePreview
                alt="Cover photo preview"
                src={coverUrl}
                spec={spec}
                onRemove={() =>
                  setRemovedUrls((current) =>
                    current.includes(coverUrl)
                      ? current
                      : [...current, coverUrl],
                  )
                }
                removeLabel="Remove cover photo"
              />
            </div>
          ))}
          {selectedPreviews.map((preview, index) => (
            <div key={preview.url} className="space-y-2">
              <ImagePreview
                alt={preview.name}
                src={preview.url}
                spec={spec}
                selected
                onRemove={() => removeSelectedCover(index)}
                removeLabel={`Remove ${preview.name}`}
              />
              <p className="truncate text-xs font-medium text-zinc-600">
                {preview.name}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <ImagePreview alt="Cover photo upload placeholder" spec={spec} />
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
                  setRemovedUrls((current) =>
                    current.filter((url) => url !== coverUrl),
                  )
                }
                className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
              >
                Restore cover
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <input
        ref={fileInputRef}
        name="cover_files"
        type="file"
        accept={partnerMediaAccept}
        multiple
        disabled={availableCoverSlots === 0}
        onChange={async (event) => {
          const input = event.currentTarget
          const files = Array.from(input.files ?? [])

          if (files.length === 0) {
            replaceFileInputFiles(input, selectedFiles)
            return
          }

          setUploadError("")
          setUploadMessage("Resizing cover photos...")

          if (files.length > availableCoverSlots) {
            replaceFileInputFiles(input, selectedFiles)
            setUploadMessage("")
            setUploadError(
              `Select up to ${availableCoverSlots} more cover photo${availableCoverSlots === 1 ? "" : "s"}.`,
            )
            return
          }

          try {
            const resizedFiles = await resizeImageFiles(files, spec)
            replaceFileInputFiles(input, resizedFiles)
            replaceSelectedCovers(resizedFiles, createImagePreviews(resizedFiles))
            setUploadMessage(
              `${resizedFiles.length} cover photo${resizedFiles.length === 1 ? "" : "s"} ready at ${spec.width}px x ${spec.height}px.`,
            )
          } catch (error) {
            input.value = ""
            setSelectedFiles([])
            setSelectedPreviews((current) => {
              revokeImagePreviews(current)
              return []
            })
            setUploadMessage("")
            setUploadError(
              error instanceof Error
                ? error.message
                : "Unable to prepare these cover photos.",
            )
          }
        }}
        className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-teal-700 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-teal-800"
      />
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
  onRemove,
  removeLabel,
  src,
  spec,
  selected = false,
}: {
  alt: string
  onRemove?: () => void
  removeLabel?: string
  src?: string
  spec: PartnerMediaSpec
  selected?: boolean
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-md border ${
        selected ? "border-teal-200 bg-white" : "border-zinc-200 bg-white"
      }`}
      style={{
        aspectRatio: `${spec.previewAspectWidth ?? spec.width} / ${
          spec.previewAspectHeight ?? spec.height
        }`,
        height: "auto",
        maxWidth: `${spec.previewMaxWidth}px`,
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
          onClick={onRemove}
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
  return `${spec.label} size: ${spec.width}px x ${spec.height}px`
}

async function resizeImageFiles(files: File[], spec: PartnerMediaSpec) {
  return await Promise.all(files.map((file) => resizeImageFile(file, spec)))
}

async function resizeImageFile(file: File, spec: PartnerMediaSpec) {
  if (!isSupportedImageFile(file)) {
    throw new Error(`"${file.name}" must be a PNG, JPEG, WebP, or SVG image.`)
  }

  const image = await loadImage(file)
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height

  if (!sourceWidth || !sourceHeight) {
    throw new Error(`Unable to read the dimensions for "${file.name}".`)
  }

  if (sourceWidth === spec.width && sourceHeight === spec.height) {
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
  pin,
}: {
  mode: "create" | "edit"
  pin?: number | string | null
}) {
  return (
    <ReadOnlyField
      label="Partner PIN"
      value={mode === "edit" ? pin ?? "Not set" : "Generated after save"}
      hint={
        mode === "edit"
          ? "Auto-generated for this partner and kept read-only here."
          : "Auto-generated when the partner is created and kept read-only here."
      }
    />
  )
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
  onChange,
}: {
  label: string
  name: string
  defaultValue?: string | null
  value?: string
  required?: boolean
  hint?: string
  placeholder?: string
  maxLength?: number
  onChange?: (value: string) => void
}) {
  const resolvedMaxLength =
    typeof maxLength === "number" ? maxLength : inferTextFieldMaxLength(name)
  const [uncontrolledLength, setUncontrolledLength] = useState(() =>
    measureCharacterCount(defaultValue),
  )
  const currentLength =
    value === undefined ? uncontrolledLength : measureCharacterCount(value)

  return (
    <label className="block space-y-2 text-sm">
      <FieldLabel label={label} required={required} />
      <textarea
        name={name}
        rows={4}
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
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
      />
      <FieldSupportText
        hint={hint}
        currentLength={currentLength}
        maxLength={resolvedMaxLength}
      />
    </label>
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
    <label className="flex min-h-10 items-start gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700">
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

function ActionMessage({ state }: { state: PartnerActionState }) {
  if (!state.message) {
    return null
  }

  return (
    <p
      className={`rounded-md border px-3 py-2 text-sm ${
        state.ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-rose-200 bg-rose-50 text-rose-700"
      }`}
      aria-live="polite"
    >
      {state.message}
    </p>
  )
}

function SubmitButton({
  label,
  name,
  pendingLabel,
  size = "default",
  tone = "default",
  value,
}: {
  label: string
  name?: string
  pendingLabel: string
  size?: "default" | "compact" | "tiny"
  tone?: "default" | "danger" | "muted" | "outline"
  value?: string
}) {
  const { data, pending } = useFormStatus()
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
      disabled={pending}
      value={value}
      className={`${sizeClasses} rounded-md font-semibold transition disabled:cursor-not-allowed ${toneClasses}`}
    >
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
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  tone?: "default" | "danger"
  onCancel: () => void
  onConfirm: () => void
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
        className="size-11 rounded-md border border-zinc-200 bg-cover bg-center"
        style={{ backgroundImage: `url(${url})` }}
      />
    )
  }

  return (
    <div className="grid size-11 place-items-center rounded-md bg-zinc-100 text-sm font-semibold text-zinc-500">
      {(name?.trim()?.[0] ?? "B").toUpperCase()}
    </div>
  )
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-md border px-2 py-1 text-xs font-semibold shadow-sm ${
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

  return (
    <p className="text-xs font-medium text-zinc-500">
      Showing {visibleCount} of {totalCount} {itemLabel}
      {hiddenCount ? `; ${hiddenCount} more are loaded but hidden here.` : "."}
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

  return labelForValue(dealUiTypeOptions, dealUiTypeForDeal(deal)) || "Deal"
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
            Pre-fill this form from an existing partner's profile. You can edit anything afterwards.
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
    return item ? `Free ${item}` : "Free item"
  }

  if (discountType === "percent") {
    return discountValue !== null ? `${discountValue}% off` : "Percent discount"
  }

  if (discountType === "fixed") {
    return discountValue !== null
      ? `€${discountValue} off`
      : "Fixed discount"
  }

  if (normalizeDiscountTypeForUi("limited_drop", discountType) === "2for1") {
    return "2-for-1"
  }

  return "Deal Drop"
}

function formatDealDropRewardText(discountType: string) {
  if (discountType === "item") {
    return "Free reward item"
  }

  return labelForValue(discountTypeOptions, discountType) || "Reward preview"
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
  const audienceLabel = labelForValue(audienceOptions, audience) || "Audience not set"

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
    return label || "Not set"
  }

  return `${label || "Value"} ${discountValue}`
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
