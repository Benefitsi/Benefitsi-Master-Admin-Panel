"use client"

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useFormStatus } from "react-dom"
import type {
  City,
  Deal,
  FraudEvent,
  MenuCategory,
  MenuItem,
  OwnerOption,
  PartnerMenu,
  PartnerOpeningHour,
  PartnerRewardMilestone,
  PartnerStaff,
  PartnerWithDeals,
  StampCardProgress,
  Visit,
} from "@/lib/admin-data"
import {
  DEFAULT_AUDIENCE,
  DEFAULT_DEAL_DROP_PRIORITY,
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
  rewardTrackTargetOptions,
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
  { value: "restaurant", label: "Restaurant" },
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

const openingWeekdayOptions = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "7", label: "Sunday" },
] as const

const menuStatusOptions = [
  { value: "draft", label: "Draft" },
  { value: "review", label: "Needs review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
] as const

type MediaSpec = {
  label: string
  width: number
  height: number
  previewMaxWidth: number
  previewFit: "contain" | "cover"
}

const partnerMediaSpecs = {
  logo: {
    label: "Logo",
    width: 380,
    height: 380,
    previewMaxWidth: 360,
    previewFit: "contain",
  },
  feature: {
    label: "Feature",
    width: 720,
    height: 490,
    previewMaxWidth: 520,
    previewFit: "cover",
  },
  cover: {
    label: "Cover",
    width: 1170,
    height: 1200,
    previewMaxWidth: 390,
    previewFit: "cover",
  },
  menuItem: {
    label: "Menu item",
    width: 720,
    height: 490,
    previewMaxWidth: 240,
    previewFit: "cover",
  },
} satisfies Record<string, MediaSpec>

type PartnerWorkspaceProps = {
  partners: PartnerWithDeals[]
  cities: City[]
  owners: OwnerOption[]
}

type InitialDealDraft = {
  id: string
  active: boolean
}

type InitialMenuCategoryDraft = {
  id: string
  name: string
}

type InitialMenuItemDraft = {
  id: string
  categoryDraftId: string
  isPopular: boolean
  isStampEligible: boolean
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

  const partnerCount = partners.length
  const activePartners = partners.filter(isPartnerActive).length
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <LiveMetric label="Partners" value={partnerCount} />
        <LiveMetric label="Active partners" value={activePartners} />
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
                onClick={() => setMode("create")}
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
              description="Create the partner profile, assign its owner, upload media, and add any starter deals in one save."
            >
              <PartnerForm cities={cities} owners={owners} mode="create" />
            </EditorShell>
          ) : selectedPartner ? (
            <PartnerDetail
              cities={cities}
              owners={owners}
              partner={selectedPartner}
              partners={partners}
            />
          ) : (
            <EditorShell
              title="No partners yet"
              description="Add a partner to start managing deals."
            >
              <PartnerForm cities={cities} owners={owners} mode="create" />
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
  partners,
  cities,
  owners,
}: {
  partner: PartnerWithDeals
  partners: PartnerWithDeals[]
  cities: City[]
  owners: OwnerOption[]
}) {
  const auditEvents = partners.flatMap((item) => item.fraud_events)

  return (
    <div className="space-y-5">
      <EditorShell
        title={partner.name || "Untitled partner"}
        description="Edit partner details, contact information, media, rewards, and Supabase routing fields."
        aside={
          <div className="flex flex-wrap gap-2">
            <StatusPill active={isPartnerActive(partner)} />
            {partner.is_featured ? <Badge>Featured</Badge> : null}
          </div>
        }
      >
        <PartnerForm
          cities={cities}
          owners={owners}
          partner={partner}
          mode="edit"
        />
      </EditorShell>

      <DealsPanel partner={partner} />
      <MilestonesPanel partner={partner} />
      <PartnerStaffPanel partner={partner} users={owners} />
      <OpeningHoursPanel partner={partner} />
      <MenuPanel partner={partner} />
      <StampProgressPanel progress={partner.stamp_progress} />
      <RedemptionHistoryPanel partner={partner} visits={partner.visits} />
      <FraudAuditPanel
        defaultPartnerId={partner.id ?? ""}
        events={auditEvents}
        partners={partners}
      />
      <QrSecurityNote />

      <EditorShell
        title="Remove partner"
        description="Deleting a partner also removes attached Supabase records through database relationships."
      >
        <DeletePartnerForm partner={partner} />
      </EditorShell>
    </div>
  )
}

function EditorShell({
  title,
  description,
  aside,
  children,
}: {
  title: string
  description: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-zinc-200 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-normal text-zinc-950">
            {title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600">
            {description}
          </p>
        </div>
        {aside}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function PartnerForm({
  partner,
  cities,
  owners,
  mode,
}: {
  partner?: PartnerWithDeals
  cities: City[]
  owners: OwnerOption[]
  mode: "create" | "edit"
}) {
  const [state, formAction] = useActionState(savePartner, initialState)
  const [initialDeals, setInitialDeals] = useState<InitialDealDraft[]>([])
  const [initialMenuEnabled, setInitialMenuEnabled] = useState(false)
  const [initialMenuCategories, setInitialMenuCategories] = useState<
    InitialMenuCategoryDraft[]
  >([])
  const [initialMenuItems, setInitialMenuItems] = useState<
    InitialMenuItemDraft[]
  >([])
  const [confirmingSave, setConfirmingSave] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const confirmedSubmitRef = useRef(false)
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

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-7"
      onSubmit={(event) => {
        if (mode !== "edit") {
          return
        }

        if (confirmedSubmitRef.current) {
          confirmedSubmitRef.current = false
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

      <FormSection title="Profile">
        <FieldGrid>
          <TextField
            label="Partner name"
            name="name"
            defaultValue={partner?.name}
            required
          />
          <TextField
            label="Short name"
            name="short_name"
            defaultValue={partner?.short_name}
          />
          <SelectField
            label="Partner type"
            name="type"
            defaultValue={partner?.type ?? "restaurant"}
            options={withCurrentOption(partnerTypeOptions, partner?.type)}
            required
          />
          <SelectField
            label="Partner city"
            name="city_id"
            defaultValue={partner?.city_id}
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
          defaultValue={partner?.description}
          required
        />
        <MultiSelectField
          label="Categories"
          name="category"
          defaultValues={partner?.category}
          options={withCurrentOptions(categoryOptions, partner?.category)}
          required
        />
      </FormSection>

      <FormSection title="Contact and Location">
        <FieldGrid>
          <TextField
            label="Phone"
            name="phone"
            defaultValue={partner?.phone}
          />
          <TextField
            label="Website"
            name="website"
            type="url"
            defaultValue={partner?.website}
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
      </FormSection>

      <FormSection title="Media">
        <div className="grid gap-4 lg:grid-cols-2">
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
        </div>
        <CoverUploadField
          key={`covers-${partner?.cover_urls?.join("|") ?? "new"}`}
          covers={partner?.cover_urls}
        />
      </FormSection>

      <FormSection title="Internal Settings">
        <FieldGrid>
          <ReadOnlyField
            label="Partner PIN"
            value={mode === "edit" ? partner?.pin ?? "Not set" : "Generated after save"}
            hint={
              mode === "edit"
                ? "Auto-generated for this partner and kept read-only here."
                : "Auto-generated when the partner is created and kept read-only here."
            }
          />
        </FieldGrid>
      </FormSection>

      {mode === "create" ? (
        <>
          <FormSection title="Operating Hours">
            <WeeklyHoursFields />
          </FormSection>

          <FormSection title="Menu">
            <InitialMenuEditor
              categories={initialMenuCategories}
              enabled={initialMenuEnabled}
              items={initialMenuItems}
              onAddCategory={() =>
                setInitialMenuCategories((current) => [
                  ...current,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                  },
                ])
              }
              onAddItem={() =>
                setInitialMenuItems((current) => [
                  ...current,
                  {
                    id: crypto.randomUUID(),
                    categoryDraftId: initialMenuCategories[0]?.id ?? "",
                    isPopular: false,
                    isStampEligible: true,
                  },
                ])
              }
              onRemoveCategory={(id) => {
                setInitialMenuCategories((current) =>
                  current.filter((category) => category.id !== id),
                )
                setInitialMenuItems((current) =>
                  current.map((item) =>
                    item.categoryDraftId === id
                      ? { ...item, categoryDraftId: "" }
                      : item,
                  ),
                )
              }}
              onRemoveItem={(id) =>
                setInitialMenuItems((current) =>
                  current.filter((item) => item.id !== id),
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

          <FormSection title="Initial Deals">
            <InitialDealsEditor
              deals={initialDeals}
              onAdd={() =>
                setInitialDeals((current) => [
                  ...current,
                  {
                    id: crypto.randomUUID(),
                    active: true,
                  },
                ])
              }
              onRemove={(id) =>
                setInitialDeals((current) =>
                  current.filter((deal) => deal.id !== id),
                )
              }
            />
          </FormSection>
        </>
      ) : null}

      <ActionMessage state={state} />
      <SubmitButton
        label={mode === "create" ? "Add partner" : "Save partner"}
        pendingLabel={mode === "create" ? "Adding partner..." : "Saving partner..."}
      />
      <ConfirmDialog
        open={confirmingSave}
        title="Save partner changes?"
        description={`This will update ${partner?.name || "this partner"} with the current form values.`}
        confirmLabel="Save changes"
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

function InitialDealsEditor({
  deals,
  onAdd,
  onRemove,
}: {
  deals: InitialDealDraft[]
  onAdd: () => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="space-y-4">
      <input type="hidden" name="initial_deal_count" value={deals.length} />
      {deals.length ? (
        <div className="space-y-4">
          {deals.map((deal, index) => (
            <div
              key={deal.id}
              className="rounded-md border border-zinc-200 bg-zinc-50 p-4"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-zinc-800">
                  Deal {index + 1}
                </h4>
                <button
                  type="button"
                  onClick={() => onRemove(deal.id)}
                  className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                >
                  Remove
                </button>
              </div>
              <DealFields
                prefix={`initial_deal_${index}_`}
                defaultActive={deal.active}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-zinc-300 p-5 text-center text-sm text-zinc-600">
          No starter deals staged.
        </div>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="h-10 rounded-md border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-800 transition hover:bg-teal-50"
      >
        Add initial deal
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
  onSetEnabled: (enabled: boolean) => void
  onUpdateCategory: (
    id: string,
    values: Partial<InitialMenuCategoryDraft>,
  ) => void
  onUpdateItem: (id: string, values: Partial<InitialMenuItemDraft>) => void
}) {
  const categoryOptions = categories.map((category, index) => ({
    value: category.id,
    label: category.name || `Category ${index + 1}`,
  }))

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
                onClick={onAddCategory}
                className="h-8 rounded-md border border-teal-700 bg-white px-3 text-xs font-semibold text-teal-800 transition hover:bg-teal-50"
              >
                Add category
              </button>
            </div>
            {categories.length ? (
              <div className="space-y-3">
                {categories.map((category, index) => (
                  <div
                    key={category.id}
                    className="rounded-md border border-zinc-200 bg-white p-3"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h5 className="text-sm font-semibold text-zinc-800">
                        Category {index + 1}
                      </h5>
                      <button
                        type="button"
                        onClick={() => onRemoveCategory(category.id)}
                        className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      type="hidden"
                      name={`initial_menu_category_${index}_draft_id`}
                      value={category.id}
                    />
                    <FieldGrid>
                      <TextField
                        label="Name"
                        name={`initial_menu_category_${index}_name`}
                        defaultValue={category.name}
                        onChange={(value) =>
                          onUpdateCategory(category.id, { name: value })
                        }
                        required
                      />
                      <TextField
                        label="Slug"
                        name={`initial_menu_category_${index}_slug`}
                        hint="Leave blank to generate from the name."
                      />
                      <TextField
                        label="Position in menu"
                        name={`initial_menu_category_${index}_sort_order`}
                        type="number"
                        defaultValue={index}
                        hint="Smaller numbers appear first."
                      />
                    </FieldGrid>
                  </div>
                ))}
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
                onClick={onAddItem}
                className="h-8 rounded-md border border-teal-700 bg-white px-3 text-xs font-semibold text-teal-800 transition hover:bg-teal-50"
              >
                Add item
              </button>
            </div>
            {items.length ? (
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className="rounded-md border border-zinc-200 bg-white p-3"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h5 className="text-sm font-semibold text-zinc-800">
                        Item {index + 1}
                      </h5>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.id)}
                        className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      type="hidden"
                      name={`initial_menu_item_${index}_draft_id`}
                      value={item.id}
                    />
                    <FieldGrid>
                      <TextField
                        label="Item name"
                        name={`initial_menu_item_${index}_name`}
                        required
                      />
                      <SelectField
                        label="Category"
                        name={`initial_menu_item_${index}_category_draft_id`}
                        value={item.categoryDraftId}
                        options={categoryOptions}
                        onChange={(value) =>
                          onUpdateItem(item.id, { categoryDraftId: value })
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
                        defaultValue={index}
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
                    <div className="mt-4">
                      <TextAreaField
                        label="Description"
                        name={`initial_menu_item_${index}_description`}
                      />
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="flex h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700">
                        <input
                          type="checkbox"
                          name={`initial_menu_item_${index}_is_popular`}
                          defaultChecked={item.isPopular}
                          onChange={(event) =>
                            onUpdateItem(item.id, {
                              isPopular: event.target.checked,
                            })
                          }
                          className="size-4 rounded border-zinc-300 accent-teal-700"
                        />
                        Popular
                      </label>
                      <label className="flex h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700">
                        <input
                          type="checkbox"
                          name={`initial_menu_item_${index}_is_stamp_eligible`}
                          defaultChecked={item.isStampEligible}
                          onChange={(event) =>
                            onUpdateItem(item.id, {
                              isStampEligible: event.target.checked,
                            })
                          }
                          className="size-4 rounded border-zinc-300 accent-teal-700"
                        />
                        Stamp eligible
                      </label>
                    </div>
                    <div className="mt-4">
                      <MediaUploadField
                        key={`initial-menu-item-${item.id}`}
                        label="Menu item picture"
                        fileName={`initial_menu_item_${index}_image_file`}
                        existingName={`initial_menu_item_${index}_existing_image_url`}
                        removeName={`initial_menu_item_${index}_remove_image`}
                        spec={partnerMediaSpecs.menuItem}
                        compact
                      />
                    </div>
                  </div>
                ))}
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

function DealsPanel({ partner }: { partner: PartnerWithDeals }) {
  const [showNewDeal, setShowNewDeal] = useState(partner.deals.length === 0)
  const partnerId = partner.id ?? ""

  return (
    <EditorShell
      title="Deals"
      description="Configure selectable, automatic, and fallback benefits for the Supabase redemption flow."
      aside={
        partnerId ? (
          <button
            type="button"
            onClick={() => setShowNewDeal((value) => !value)}
            className="h-9 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white transition hover:bg-teal-800"
          >
            {showNewDeal ? "Hide form" : "Add deal"}
          </button>
        ) : null
      }
    >
      <div className="space-y-4">
        <InfoNote>
          Direct selectable deals are user-selected before a scan. Automatic
          background deals are applied by `redeem_visit` when eligible.
          Automatic fallback deals apply only when no direct deal was selected.
        </InfoNote>
        {showNewDeal && partnerId ? (
          <DealFormShell title="Add deal">
            <DealForm partnerId={partnerId} mode="create" />
          </DealFormShell>
        ) : null}

        {partner.deals.length ? (
          <div className="max-h-[52rem] overflow-y-auto pr-2">
            <div className="grid gap-4 2xl:grid-cols-2">
              {partner.deals.map((deal) => (
                <DealCard
                  key={deal.id ?? `${deal.partner_id}-${deal.type}`}
                  deal={deal}
                  partnerId={partnerId}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600">
            This partner does not have any deals yet.
          </div>
        )}
      </div>
    </EditorShell>
  )
}

function DealCard({ deal, partnerId }: { deal: Deal; partnerId: string }) {
  const [editing, setEditing] = useState(false)
  const isLimitedDrop = deal.type === "limited_drop"
  const soldOut =
    isLimitedDrop &&
    isSoldOutDealDrop(deal.stock_total ?? null, deal.stock_remaining ?? null)

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-normal text-zinc-950">
            {labelForValue(dealTypeOptions, deal.type) || "Untitled deal"}
          </h3>
          <p className="mt-1 text-sm text-zinc-600">
            {formatDealSummary(deal)}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <StatusPill active={Boolean(deal.active)} />
          <Badge>{labelForValue(benefitCategoryOptions, deal.benefit_category)}</Badge>
          <Badge>{labelForValue(audienceOptions, deal.audience)}</Badge>
        </div>
      </div>

      {soldOut ? (
        <div className="mt-4">
          <WarningNote>
            This Deal Drop is sold out and users cannot redeem it.
          </WarningNote>
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
        <Info
          label="Activation"
          value={deal.activation_required ? "Required" : "Not required"}
        />
        {!isLimitedDrop ? (
          <Info
            label="Happy hour"
            value={formatTimeRange(deal.happy_hour_start, deal.happy_hour_end)}
          />
        ) : null}
        <Info label="Reward" value={deal.reward_item || "Not set"} />
        {!isLimitedDrop ? (
          <>
            <Info
              label="Benefit count"
              value={formatOptionalNumber(deal.benefit_count)}
            />
            <Info label="Trigger" value={formatOptionalNumber(deal.trigger_value)} />
          </>
        ) : null}
        <Info
          label="Selection expiry"
          value={
            deal.selection_expires_minutes
              ? `${deal.selection_expires_minutes} minutes`
              : "Not set"
          }
        />
        {isLimitedDrop ? (
          <>
            <Info
              label="Stock"
              value={formatDealDropStockState(
                deal.stock_total ?? null,
                deal.stock_remaining ?? null,
                soldOut,
              )}
            />
            <Info label="Ends" value={formatDateTime(deal.ends_at)} />
          </>
        ) : null}
        <Info
          label="Estimated savings"
          value={formatOptionalNumber(deal.estimated_savings)}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100"
        >
          {editing ? "Close editor" : "Edit deal"}
        </button>
        {deal.id ? <DeleteDealForm dealId={deal.id} /> : null}
      </div>

      {editing ? (
        <div className="mt-4 border-t border-zinc-200 pt-4">
          <DealForm deal={deal} partnerId={partnerId} mode="edit" />
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
  partnerId,
  mode,
}: {
  deal?: Deal
  partnerId: string
  mode: "create" | "edit"
}) {
  const [state, formAction] = useActionState(saveDeal, initialState)

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={deal?.id ?? ""} />
      <input type="hidden" name="partner_id" value={partnerId} />

      <DealFields
        deal={deal}
        defaultActive={deal?.active ?? true}
      />

      <ActionMessage state={state} />
      <SubmitButton
        label={mode === "create" ? "Add deal" : "Save deal"}
        pendingLabel={mode === "create" ? "Adding deal..." : "Saving deal..."}
      />
    </form>
  )
}

function DealFields({
  deal,
  prefix = "",
  defaultActive,
}: {
  deal?: Deal
  prefix?: string
  defaultActive: boolean
}) {
  const initialDealType = deal?.type ?? "discount"
  const initialDiscountType =
    deal?.discount_type ??
    (initialDealType === "limited_drop"
      ? "item"
      : initialDealType === "bonus_stamp"
      ? "bonus_stamp"
      : initialDealType === "two_for_one"
        ? "2for1"
        : "none")
  const [selectedDealType, setSelectedDealType] = useState(initialDealType)
  const [selectedDiscountType, setSelectedDiscountType] = useState(
    normalizeDealDropDiscountType(initialDealType, initialDiscountType),
  )
  const [selectedBenefitCategory, setSelectedBenefitCategory] = useState(
    deal?.benefit_category ??
      inferBenefitCategory(initialDealType, initialDiscountType),
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
  const [discountValue, setDiscountValue] = useState(
    formatTextInputValue(deal?.discount_value),
  )
  const [rewardItem, setRewardItem] = useState(deal?.reward_item ?? "")
  const [customerDescription, setCustomerDescription] = useState(
    deal?.customer_description ?? "",
  )
  const [estimatedSavings, setEstimatedSavings] = useState(
    formatTextInputValue(deal?.estimated_savings),
  )
  const [startsAt, setStartsAt] = useState(
    formatDateTimeInput(deal?.starts_at ?? deal?.valid_from),
  )
  const [endsAt, setEndsAt] = useState(
    formatDateTimeInput(deal?.ends_at ?? deal?.valid_until),
  )
  const [expiryDays, setExpiryDays] = useState(
    formatTextInputValue(deal?.expiry_days),
  )
  const [allowFreeTrial, setAllowFreeTrial] = useState(
    deal?.allow_free_trial ?? false,
  )
  const isLimitedDrop = selectedDealType === "limited_drop"
  const benefitCategory = normalizeBenefitCategory(
    selectedDealType,
    selectedDiscountType,
    selectedBenefitCategory,
  )
  const activationRequired = activationRequiredForCategory(benefitCategory)
  const showsDiscountValue =
    selectedDiscountType === "fixed" || selectedDiscountType === "percent"
  const showsRewardItem = selectedDiscountType === "item"
  const showsBenefitCount =
    !isLimitedDrop && selectedDiscountType === "bonus_stamp"
  const showsAllowFreeTrial =
    isLimitedDrop && selectedDiscountType === "twoforone"
  const isHappyHour = selectedDealType === "happy_hour"
  const isStreak = selectedDealType === "streak"
  const discountOptions = isLimitedDrop
    ? dealDropDiscountTypeOptions
    : discountTypeOptions.filter((option) => option.value !== "twoforone")
  const dealDropSoldOut =
    isLimitedDrop &&
    isSoldOutDealDrop(
      parseOptionalNumberInput(dealDropStockTotal),
      parseOptionalNumberInput(dealDropStockRemaining),
    )
  const benefitHint =
    benefitCategoryOptions.find((option) => option.value === benefitCategory)
      ?.hint ?? ""

  return (
    <div className="space-y-5">
      <FormSection title="Deal Details">
        {isLimitedDrop ? (
          <InfoNote>
            Deal Drops are limited-time or limited-stock offers. Users must
            select them before scanning. They do not stack with other direct
            deals.
          </InfoNote>
        ) : null}
        {dealDropSoldOut ? (
          <WarningNote>
            This Deal Drop is sold out and users cannot redeem it.
          </WarningNote>
        ) : null}
        <FieldGrid>
          <SelectField
            label="Deal type"
            name={`${prefix}type`}
            value={selectedDealType}
            options={withCurrentOption(dealTypeOptions, deal?.type)}
            onChange={(value) => {
              const nextDiscountType =
                value === "limited_drop"
                  ? normalizeDealDropDiscountType(value, selectedDiscountType)
                  : selectedDiscountType === "twoforone"
                    ? "2for1"
                    : selectedDiscountType

              setSelectedDealType(value)
              setSelectedDiscountType(nextDiscountType)
              if (value === "limited_drop") {
                setSelectedBenefitCategory("direct_selectable")
                return
              }

              setSelectedBenefitCategory(
                inferBenefitCategory(value, nextDiscountType),
              )
            }}
            required
          />
          <SelectField
            label="Discount type"
            name={`${prefix}discount_type`}
            value={selectedDiscountType}
            options={withCurrentOption(
              discountOptions,
              isLimitedDrop ? selectedDiscountType : deal?.discount_type,
            )}
            onChange={(value) => {
              const nextValue = normalizeDealDropDiscountType(
                selectedDealType,
                value,
              )

              setSelectedDiscountType(nextValue)
              setSelectedBenefitCategory(
                selectedDealType === "limited_drop"
                  ? "direct_selectable"
                  : inferBenefitCategory(selectedDealType, nextValue),
              )
            }}
            required
          />
          {isLimitedDrop ? (
            <>
              <ReadOnlyField
                label="Benefit category"
                value="User selects before visit"
                hint={benefitHint}
              />
              <input
                type="hidden"
                name={`${prefix}benefit_category`}
                value="direct_selectable"
              />
            </>
          ) : (
            <SelectField
              label="Benefit category"
              name={`${prefix}benefit_category`}
              value={benefitCategory}
              options={withCurrentOption(
                benefitCategoryOptions,
                deal?.benefit_category,
              )}
              onChange={setSelectedBenefitCategory}
              hint={benefitHint}
              required
            />
          )}
          <SelectField
            label="Audience"
            name={`${prefix}audience`}
            value={selectedAudience}
            options={withCurrentOption(audienceOptions, deal?.audience)}
            onChange={setSelectedAudience}
            required
          />
          {showsDiscountValue ? (
            <TextField
              label="Discount value"
              name={`${prefix}discount_value`}
              type="number"
              step="any"
              min={0.01}
              max={selectedDiscountType === "percent" ? 100 : undefined}
              value={discountValue}
              onChange={setDiscountValue}
              required
            />
          ) : null}
          {showsRewardItem ? (
            <TextField
              label="Reward item"
              name={`${prefix}reward_item`}
              value={rewardItem}
              onChange={setRewardItem}
              required
            />
          ) : null}
          {showsAllowFreeTrial ? (
            <CheckboxField
              label="Allow free user trial"
              name={`${prefix}allow_free_trial`}
              checked={allowFreeTrial}
              onChange={setAllowFreeTrial}
              hint="Free users can redeem this once using their global 2for1 trial."
            />
          ) : null}
          {showsBenefitCount ? (
            <TextField
              label="Stamp reward count"
              name={`${prefix}benefit_count`}
              type="number"
              defaultValue={deal?.benefit_count ?? 1}
              required
            />
          ) : null}
        </FieldGrid>
        <div className="grid gap-3 sm:grid-cols-3">
          <CheckboxField
            label="Active"
            name={`${prefix}active`}
            defaultChecked={defaultActive}
          />
          <CheckboxField
            label="Reserve stock on selection"
            name={`${prefix}reserve_on_selection`}
            defaultChecked={deal?.reserve_on_selection ?? false}
            hint="If enabled, stock is temporarily reserved immediately after a user selects the deal."
          />
          {!isLimitedDrop ? (
            <ReadOnlyStatusField
              label="Activation required"
              value={activationRequired ? "Yes" : "No"}
            />
          ) : null}
          <input
            type="hidden"
            name={`${prefix}activation_required`}
            value={isLimitedDrop || activationRequired ? "true" : "false"}
          />
        </div>
      </FormSection>

      <FormSection title="Reward Copy">
        <FieldGrid>
          <TextAreaField
            label="Customer description"
            name={`${prefix}customer_description`}
            value={customerDescription}
            onChange={setCustomerDescription}
          />
          <TextAreaField
            label="Staff instructions"
            name={`${prefix}staff_instructions`}
            defaultValue={deal?.staff_instructions}
            hint="Scanner and order staff see this when deciding what to give."
          />
          <TextAreaField
            label="Terms"
            name={`${prefix}terms`}
            defaultValue={deal?.terms}
          />
        </FieldGrid>
      </FormSection>

      {isHappyHour || isStreak || isLimitedDrop ? (
        <FormSection title="Timing and Rules">
          <FieldGrid>
            {isHappyHour ? (
              <>
                <TextField
                  label="Happy hour start"
                  name={`${prefix}happy_hour_start`}
                  type="time"
                  defaultValue={deal?.happy_hour_start}
                  required
                />
                <TextField
                  label="Happy hour end"
                  name={`${prefix}happy_hour_end`}
                  type="time"
                  defaultValue={deal?.happy_hour_end}
                  required
                />
              </>
            ) : null}
            {isStreak ? (
              <TextField
                label="Trigger value"
                name={`${prefix}trigger_value`}
                type="number"
                defaultValue={deal?.trigger_value}
                required
              />
            ) : null}
            {isLimitedDrop ? (
              <>
                <TextField
                  label="Start date/time"
                  name={`${prefix}starts_at`}
                  type="datetime-local"
                  value={startsAt}
                  onChange={setStartsAt}
                />
                <TextField
                  label="End date/time"
                  name={`${prefix}ends_at`}
                  type="datetime-local"
                  value={endsAt}
                  onChange={setEndsAt}
                />
                <TextField
                  label="Stock total"
                  name={`${prefix}stock_total`}
                  type="number"
                  min={0}
                  value={dealDropStockTotal}
                  onChange={(value) => {
                    setDealDropStockTotal(value)
                    if (!stockRemainingEdited) {
                      setDealDropStockRemaining(value)
                    }
                  }}
                />
                <TextField
                  label="Stock remaining"
                  name={`${prefix}stock_remaining`}
                  type="number"
                  min={0}
                  value={dealDropStockRemaining}
                  onChange={(value) => {
                    setStockRemainingEdited(true)
                    setDealDropStockRemaining(value)
                  }}
                />
                <TextField
                  label="Max redemptions global"
                  name={`${prefix}max_redemptions_global`}
                  type="number"
                  min={0}
                  defaultValue={deal?.max_redemptions_global}
                />
                <TextField
                  label="Max redemptions per user"
                  name={`${prefix}max_redemptions_per_user`}
                  type="number"
                  min={0}
                  defaultValue={deal?.max_redemptions_per_user}
                />
                <TextField
                  label="Cooldown hours"
                  name={`${prefix}cooldown_hours`}
                  type="number"
                  min={0}
                  defaultValue={deal?.cooldown_hours}
                />
                <TextField
                  label="Priority"
                  name={`${prefix}priority`}
                  type="number"
                  defaultValue={deal?.priority ?? DEFAULT_DEAL_DROP_PRIORITY}
                />
                <TextField
                  label="Estimated savings"
                  name={`${prefix}estimated_savings`}
                  type="number"
                  step="any"
                  min={0}
                  value={estimatedSavings}
                  onChange={setEstimatedSavings}
                />
              </>
            ) : null}
          </FieldGrid>
        </FormSection>
      ) : null}

      <FormSection title="Limits and Scheduling">
        <FieldGrid>
          {!isLimitedDrop ? (
            <TextField
              label="Estimated savings"
              name={`${prefix}estimated_savings`}
              type="number"
              step="any"
              min={0}
              defaultValue={deal?.estimated_savings}
            />
          ) : null}
          <TextField
            label="Expiry days"
            name={`${prefix}expiry_days`}
            type="number"
            min={0}
            value={expiryDays}
            onChange={setExpiryDays}
          />
          {!isLimitedDrop ? (
            <>
              <TextField
                label="Valid from"
                name={`${prefix}valid_from`}
                type="datetime-local"
                defaultValue={formatDateTimeInput(deal?.valid_from)}
              />
              <TextField
                label="Valid until"
                name={`${prefix}valid_until`}
                type="datetime-local"
                defaultValue={formatDateTimeInput(deal?.valid_until)}
              />
              <TextField
                label="Max redemptions global"
                name={`${prefix}max_redemptions_global`}
                type="number"
                min={0}
                defaultValue={deal?.max_redemptions_global}
              />
              <TextField
                label="Max redemptions per user"
                name={`${prefix}max_redemptions_per_user`}
                type="number"
                min={0}
                defaultValue={deal?.max_redemptions_per_user}
              />
              <TextField
                label="Cooldown hours"
                name={`${prefix}cooldown_hours`}
                type="number"
                min={0}
                defaultValue={deal?.cooldown_hours}
              />
            </>
          ) : null}
          <TextField
            label="Selection expiry minutes"
            name={`${prefix}selection_expires_minutes`}
            type="number"
            min={1}
            defaultValue={
              deal?.selection_expires_minutes ??
              DEFAULT_SELECTION_EXPIRES_MINUTES
            }
          />
          {!isLimitedDrop ? (
            <TextField
              label="Priority"
              name={`${prefix}priority`}
              type="number"
              defaultValue={deal?.priority}
            />
          ) : null}
          <TextField
            label="Minimum spend"
            name={`${prefix}min_spend`}
            type="number"
            step="any"
            min={0}
            defaultValue={deal?.min_spend}
          />
          <TextField
            label="Max discount amount"
            name={`${prefix}max_discount_amount`}
            type="number"
            step="any"
            min={0}
            defaultValue={deal?.max_discount_amount}
          />
          {isLimitedDrop ? (
            <input
              type="hidden"
              name={`${prefix}reward_track_target`}
              value={deal?.reward_track_target ?? DEFAULT_REWARD_TRACK_TARGET}
            />
          ) : (
            <SelectField
              label="Reward track target"
              name={`${prefix}reward_track_target`}
              defaultValue={
                deal?.reward_track_target ?? DEFAULT_REWARD_TRACK_TARGET
              }
              options={withCurrentOption(
                rewardTrackTargetOptions,
                deal?.reward_track_target,
              )}
            />
          )}
          <TextField
            label="Timezone"
            name={`${prefix}timezone`}
            defaultValue={deal?.timezone ?? DEFAULT_TIMEZONE}
          />
          {isLimitedDrop ? (
            <WeekdayChipField
              label="Valid weekdays"
              name={`${prefix}valid_weekdays`}
              defaultValues={deal?.valid_weekdays}
            />
          ) : (
            <MultiSelectField
              label="Weekdays"
              name={`${prefix}weekdays`}
              defaultValues={deal?.weekdays}
              options={withCurrentOptions(weekdayOptions, deal?.weekdays)}
            />
          )}
        </FieldGrid>
      </FormSection>

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
          trialEligible={showsAllowFreeTrial && allowFreeTrial}
        />
      ) : null}

      <AdvancedSettingsSection>
        <JsonTextAreaField
          label="Metadata JSON"
          name={`${prefix}metadata`}
          defaultValue={formatMetadataInput(deal?.metadata)}
          placeholder='{"campaign":"summer"}'
        />
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
    <FormSection title="Live Preview">
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
            value={formatSavingsPreview(estimatedSavings)}
          />
          <Info label="Expiry" value={expiryInfo} />
        </div>
      </div>
    </FormSection>
  )
}

function MilestonesPanel({ partner }: { partner: PartnerWithDeals }) {
  const [showNewMilestone, setShowNewMilestone] = useState(
    partner.reward_milestones.length === 0,
  )
  const partnerId = partner.id ?? ""

  return (
    <EditorShell
      title="Stamp-card milestones"
      description="Manage stamp-card rewards separately from deals."
      aside={
        partnerId ? (
          <button
            type="button"
            onClick={() => setShowNewMilestone((value) => !value)}
            className="h-9 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white transition hover:bg-teal-800"
          >
            {showNewMilestone ? "Hide form" : "Add milestone"}
          </button>
        ) : null
      }
    >
      <div className="space-y-4">
        <InfoNote>
          Milestone rewards are given immediately during the scan/order. They do
          not require user activation. Milestones repeat every card cycle. For a
          10-stamp card, a 5-stamp milestone triggers at 5, 15, 25...
        </InfoNote>
        {showNewMilestone && partnerId ? (
          <DealFormShell title="Add milestone">
            <MilestoneForm partner={partner} mode="create" />
          </DealFormShell>
        ) : null}
        {partner.reward_milestones.length ? (
          <div className="grid gap-4 2xl:grid-cols-2">
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
      </div>
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
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-normal text-zinc-950">
            {milestone.title || milestone.reward_item || "Milestone reward"}
          </h3>
          <p className="mt-1 text-sm text-zinc-600">
            {formatOptionalNumber(milestone.required_stamps)} stamps -
            {" "}
            {labelForValue(rewardTypeOptions, milestone.reward_type)}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <StatusPill active={Boolean(milestone.active)} />
          <Badge>{labelForValue(milestoneAudienceOptions, milestone.audience)}</Badge>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
        <Info label="Reward item" value={milestone.reward_item || "Not set"} />
        <Info
          label="Discount"
          value={formatRewardValue(milestone.discount_type, milestone.discount_value)}
        />
        <Info
          label="Estimated savings"
          value={formatOptionalNumber(milestone.estimated_savings)}
        />
        <Info
          label="Staff instructions"
          value={milestone.staff_instructions || "Not set"}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100"
        >
          {editing ? "Close editor" : "Edit milestone"}
        </button>
        {milestone.id ? <DeleteMilestoneForm milestoneId={milestone.id} /> : null}
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

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={milestone?.id ?? ""} />
      <input type="hidden" name="partner_id" value={partner.id ?? ""} />
      <FormSection title="Milestone Details">
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
          <SelectField
            label="Reward track target"
            name="reward_track_target"
            defaultValue={
              milestone?.reward_track_target ?? DEFAULT_REWARD_TRACK_TARGET
            }
            options={withCurrentOption(
              rewardTrackTargetOptions,
              milestone?.reward_track_target,
            )}
          />
        </FieldGrid>
        <CheckboxField
          label="Active"
          name="active"
          defaultChecked={milestone?.active ?? true}
        />
      </FormSection>
      <FormSection title="Copy and Instructions">
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
      description="Authorize partner users who can redeem QR tokens for this partner."
      aside={
        partner.id ? (
          <button
            type="button"
            onClick={() => setShowNewStaff((value) => !value)}
            className="h-9 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white transition hover:bg-teal-800"
          >
            {showNewStaff ? "Hide form" : "Add staff"}
          </button>
        ) : null
      }
    >
      <div className="space-y-4">
        {showNewStaff ? (
          <DealFormShell title="Add staff access">
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
          <EmptyState>No scanner or staff access configured yet.</EmptyState>
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-normal text-zinc-950">
            {staff.user_name || staff.user_email || staff.user_id || "Staff user"}
          </h3>
          <p className="mt-1 text-sm text-zinc-600">
            {labelForValue(partnerStaffRoleOptions, staff.role)}
          </p>
        </div>
        <StatusPill active={Boolean(staff.active)} />
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
      <CheckboxField
        label="Active"
        name="active"
        defaultChecked={staff?.active ?? true}
      />
      <ActionMessage state={state} />
      <SubmitButton
        label={mode === "create" ? "Add staff access" : "Save staff access"}
        pendingLabel={mode === "create" ? "Adding access..." : "Saving access..."}
      />
    </form>
  )
}

function OpeningHoursPanel({ partner }: { partner: PartnerWithDeals }) {
  const partnerId = partner.id ?? ""
  const hoursByWeekday = new Map(
    partner.opening_hours.map((hour) => [hour.weekday, hour] as const),
  )

  return (
    <EditorShell
      title="Operating hours"
      description="Set the full weekly schedule in one pass."
    >
      <div className="space-y-4">
        <InfoNote>
          Toggle closed days, adjust times, then save the weekly schedule once.
        </InfoNote>
        {partnerId ? (
          <WeeklyOpeningHoursForm
            hoursByWeekday={hoursByWeekday}
            partnerId={partnerId}
          />
        ) : null}
      </div>
    </EditorShell>
  )
}

function WeeklyOpeningHoursForm({
  hoursByWeekday,
  partnerId,
}: {
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
      <WeeklyHoursFields hoursByWeekday={hoursByWeekday} />
      <ActionMessage state={state} />
      <SubmitButton
        label="Save weekly hours"
        pendingLabel="Saving weekly hours..."
      />
    </form>
  )
}

function WeeklyHoursFields({
  hoursByWeekday = new Map(),
}: {
  hoursByWeekday?: Map<number | null, PartnerOpeningHour>
}) {
  const [bulkOpenTime, setBulkOpenTime] = useState("09:00")
  const [bulkCloseTime, setBulkCloseTime] = useState("18:00")
  const [weeklyHours, setWeeklyHours] = useState(() =>
    Object.fromEntries(
      openingWeekdayOptions.map((day) => {
        const hour = hoursByWeekday.get(Number(day.value))

        return [
          day.value,
          {
            closesAt: formatTimeInput(hour?.closes_at) || "18:00",
            isClosed: hour?.is_closed ?? false,
            label: hour?.label ?? "",
            opensAt: formatTimeInput(hour?.opens_at) || "09:00",
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
  }

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
            className="self-end rounded-md bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
          >
            Apply to all open days
          </button>
        </div>
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
                    onChange={(event) =>
                      updateWeeklyHour(day.value, {
                        isClosed: event.target.checked,
                      })
                    }
                    className="size-4 rounded border-zinc-300 accent-teal-700"
                  />
                  Closed
                </label>
                <input
                  aria-label={`${day.label} opening time`}
                  name={`opens_at_${day.value}`}
                  type="time"
                  value={hour.opensAt}
                  onChange={(event) =>
                    updateWeeklyHour(day.value, { opensAt: event.target.value })
                  }
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />
                <input
                  aria-label={`${day.label} closing time`}
                  name={`closes_at_${day.value}`}
                  type="time"
                  value={hour.closesAt}
                  onChange={(event) =>
                    updateWeeklyHour(day.value, { closesAt: event.target.value })
                  }
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />
                <input
                  aria-label={`${day.label} note`}
                  name={`label_${day.value}`}
                  placeholder="Optional note"
                  value={hour.label}
                  onChange={(event) =>
                    updateWeeklyHour(day.value, { label: event.target.value })
                  }
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MenuPanel({ partner }: { partner: PartnerWithDeals }) {
  const partnerId = partner.id ?? ""
  const menu = partner.menus[0]

  return (
    <EditorShell
      title="Menu"
      description="Each partner has one menu with sections and items."
    >
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
  const categoryOptions = menu.categories.map((category) => ({
    value: category.id ?? "",
    label: category.name || category.id || "Unnamed category",
  }))

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
        <Badge>
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
      <div className="mt-4 grid gap-2 text-sm text-zinc-600 sm:grid-cols-3">
        <Info label="Categories" value={String(menu.categories.length)} />
        <Info label="Items" value={String(menu.items.length)} />
        <Info label="Updated" value={formatDateTime(menu.updated_at)} />
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
            <MenuCategoryForm menuId={menu.id} />
          </DealFormShell>
        ) : null}
        {menu.categories.length ? (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {menu.categories.map((category) => (
              <MenuCategoryCard
                key={category.id ?? `${category.menu_id}-${category.name}`}
                category={category}
                menuId={menu.id ?? ""}
              />
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
              menuId={menu.id}
            />
          </DealFormShell>
        ) : null}
        {menu.items.length ? (
          <div className="max-h-[46rem] overflow-y-auto pr-2">
            <div className="grid gap-4 2xl:grid-cols-2">
              {menu.items.map((item) => (
                <MenuItemCard
                  key={item.id ?? `${item.menu_id}-${item.name}`}
                  categoryOptions={categoryOptions}
                  item={item}
                  menuId={menu.id ?? ""}
                />
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
  category,
  menuId,
}: {
  category: MenuCategory
  menuId: string
}) {
  const [editing, setEditing] = useState(false)

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
          onClick={() => setEditing((value) => !value)}
          className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100"
        >
          {editing ? "Close editor" : "Edit category"}
        </button>
        {category.id ? <DeleteMenuCategoryForm categoryId={category.id} /> : null}
      </div>
      {editing ? (
        <div className="mt-3 border-t border-zinc-200 pt-3">
          <MenuCategoryForm category={category} menuId={menuId} />
        </div>
      ) : null}
    </div>
  )
}

function MenuCategoryForm({
  category,
  menuId,
}: {
  category?: MenuCategory
  menuId: string
}) {
  const [state, formAction] = useActionState(saveMenuCategory, initialState)

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
          label="Slug"
          name="slug"
          defaultValue={category?.slug}
          hint="Leave blank to generate from the name."
        />
        <TextField
          label="Position in menu"
          name="sort_order"
          type="number"
          hint="Smaller numbers appear first."
          defaultValue={category?.sort_order ?? 0}
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
  categoryOptions,
  item,
  menuId,
}: {
  categoryOptions: { value: string; label: string }[]
  item: MenuItem
  menuId: string
}) {
  const [editing, setEditing] = useState(false)

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
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            {item.description || "No description"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.is_popular ? <Badge>Popular</Badge> : null}
            {item.is_stamp_eligible ? <Badge>Stamp eligible</Badge> : null}
            {item.tags?.map((tag) => <Badge key={tag}>{tag}</Badge>)}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
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
          />
        </div>
      ) : null}
    </div>
  )
}

function MenuItemForm({
  categoryOptions,
  item,
  menuId,
}: {
  categoryOptions: { value: string; label: string }[]
  item?: MenuItem
  menuId: string
}) {
  const [state, formAction] = useActionState(saveMenuItem, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={item?.id ?? ""} />
      <input type="hidden" name="menu_id" value={menuId} />
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
          hint="Smaller numbers appear first."
          defaultValue={item?.sort_order ?? 0}
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
        <CheckboxField
          label="Stamp eligible"
          name="is_stamp_eligible"
          defaultChecked={item?.is_stamp_eligible ?? true}
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

function FraudAuditPanel({
  events,
  partners,
  defaultPartnerId,
}: {
  events: FraudEvent[]
  partners: PartnerWithDeals[]
  defaultPartnerId: string
}) {
  const [severity, setSeverity] = useState("")
  const [partnerId, setPartnerId] = useState(defaultPartnerId)
  const [eventType, setEventType] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const severityOptions = uniqueOptions(events.map((event) => event.severity))
  const eventTypeOptions = uniqueOptions(events.map((event) => event.event_type))
  const partnerOptions = partners.map((partner) => ({
    value: partner.id ?? "",
    label: partner.name || partner.id || "Unnamed partner",
  }))
  const partnerNames = new Map(
    partners
      .map((partner) => [partner.id ?? "", partner.name || partner.id || ""] as const)
      .filter(([id]) => Boolean(id)),
  )
  const filteredEvents = events.filter((event) => {
    if (severity && event.severity !== severity) {
      return false
    }

    if (partnerId && event.partner_id !== partnerId) {
      return false
    }

    if (eventType && event.event_type !== eventType) {
      return false
    }

    if (dateFrom && compareDate(event.created_at, dateFrom) < 0) {
      return false
    }

    if (dateTo && compareDate(event.created_at, dateTo) > 0) {
      return false
    }

    return true
  })

  return (
    <EditorShell
      title="Fraud and audit events"
      description="Review redemption and scanner audit events from fraud_events."
    >
      <div className="space-y-4">
        <InfoNote>
          Fraud and audit events are security log entries for redemption and
          scanner activity. They help review suspicious behavior and trace who
          scanned, redeemed, or triggered a protected action.
        </InfoNote>
        <FieldGrid>
          <SelectField
            label="Severity"
            name="fraud_severity_filter"
            value={severity}
            options={severityOptions}
            onChange={setSeverity}
          />
          <SelectField
            label="Partner"
            name="fraud_partner_filter"
            value={partnerId}
            options={partnerOptions}
            onChange={setPartnerId}
          />
          <SelectField
            label="Event type"
            name="fraud_event_type_filter"
            value={eventType}
            options={eventTypeOptions}
            onChange={setEventType}
          />
          <TextField
            label="Date from"
            name="fraud_date_from_filter"
            type="date"
            defaultValue={dateFrom}
            onChange={setDateFrom}
          />
          <TextField
            label="Date to"
            name="fraud_date_to_filter"
            type="date"
            defaultValue={dateTo}
            onChange={setDateTo}
          />
        </FieldGrid>
        {filteredEvents.length ? (
          <div className="grid gap-3">
            {filteredEvents.slice(0, 50).map((event) => (
              <div
                key={event.id ?? `${event.event_type}-${event.created_at}`}
                className="rounded-md border border-zinc-200 bg-zinc-50 p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-950">
                      {event.event_type || "Audit event"}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-600">
                      {event.description || event.reason_code || "No description"}
                    </p>
                  </div>
                  <Badge>{event.severity || "severity unknown"}</Badge>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2 xl:grid-cols-3">
                  <Info label="Reason" value={event.reason_code || "Not set"} />
                  <Info
                    label="Partner"
                    value={
                      event.partner_id
                        ? partnerNames.get(event.partner_id) ??
                          shortId(event.partner_id)
                        : "Not set"
                    }
                  />
                  <Info label="User" value={event.user_email || shortId(event.user_id)} />
                  <Info
                    label="Staff"
                    value={event.staff_email || shortId(event.staff_user_id)}
                  />
                  <Info label="Visit" value={shortId(event.visit_id)} />
                  <Info label="Redemption" value={shortId(event.redemption_id)} />
                  <Info label="QR token" value={shortId(event.qr_token_id)} />
                  <Info label="Created" value={formatDateTime(event.created_at)} />
                  <Info label="Metadata" value={formatJsonSummary(event.metadata)} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>No fraud events match these filters.</EmptyState>
        )}
      </div>
    </EditorShell>
  )
}

function QrSecurityNote() {
  return (
    <EditorShell
      title="QR redemption security"
      description="The admin panel should never create redemption visits by inserting rows."
    >
      <InfoNote>
        QR codes must contain only the server-generated qr_token. Never include
        user ID, deal ID, premium status, or other decision data in the QR
        payload. Scanner apps should use create_qr_token and redeem_visit RPCs.
      </InfoNote>
    </EditorShell>
  )
}

function DeletePartnerForm({ partner }: { partner: PartnerWithDeals }) {
  const [state, formAction] = useActionState(deletePartner, initialState)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const confirmedSubmitRef = useRef(false)

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

function DeleteDealForm({ dealId }: { dealId: string }) {
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
        label="Delete"
        pendingLabel="Deleting deal..."
        size="compact"
        tone="danger"
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
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-500">
        {title}
      </h3>
      {children}
    </section>
  )
}

function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {children}
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
  required?: boolean
  placeholder?: string
  value?: string | number
  defaultValue?: string | number | null
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
  required,
  placeholder,
  value,
  defaultValue,
  onChange,
}: TextFieldProps) {
  return (
    <label className="block space-y-2 text-sm">
      <FieldLabel label={label} required={required} />
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
        onChange={(event) => onChange?.(event.target.value)}
        className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
      />
      {hint ? <span className="block text-xs text-zinc-500">{hint}</span> : null}
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
}: {
  label: string
  name: string
  options: readonly { value: string; label: string }[]
  defaultValues?: string[] | null
  required?: boolean
}) {
  const [selectedValues, setSelectedValues] = useState(defaultValues ?? [])
  const selectedLabels = selectedValues.length
    ? selectedValues.join(", ")
    : "Select..."

  return (
    <div className="space-y-2 text-sm">
      <FieldLabel label={label} required={required} />
      <details className="relative">
        <summary className="flex min-h-10 cursor-pointer list-none items-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100">
          <span className="line-clamp-2">{selectedLabels}</span>
        </summary>
        <div className="absolute z-20 mt-2 grid max-h-72 w-full gap-1 overflow-y-auto rounded-md border border-zinc-200 bg-white p-2 shadow-lg">
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
    </div>
  )
}

function WeekdayChipField({
  label,
  name,
  defaultValues,
}: {
  label: string
  name: string
  defaultValues?: Array<number | string> | null
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
    </fieldset>
  )
}

function AdvancedSettingsSection({ children }: { children: ReactNode }) {
  return (
    <details className="rounded-md border border-zinc-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.12em] text-zinc-500">
        Advanced Settings
      </summary>
      <div className="mt-4 space-y-4">
        <p className="text-sm leading-6 text-zinc-600">
          Optional advanced configuration for developers and experimental features.
        </p>
        {children}
      </div>
    </details>
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
}: {
  label: string
  fileName: string
  existingName: string
  removeName: string
  currentUrl?: string | null
  spec: MediaSpec
  compact?: boolean
}) {
  const [removed, setRemoved] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [selectedPreviews, setSelectedPreviews] = useState<ImagePreview[]>([])
  const [uploadMessage, setUploadMessage] = useState("")
  const [uploadError, setUploadError] = useState("")
  const hasSelectedPreviews = selectedPreviews.length > 0
  const showCurrent = Boolean(currentUrl) && !removed && !hasSelectedPreviews
  const sizeHint = mediaSizeHint(spec)

  useEffect(
    () => () => revokeImagePreviews(selectedPreviews),
    [selectedPreviews],
  )

  return (
    <div className="flex h-full flex-col gap-3 rounded-md border border-zinc-200 p-3 text-sm">
      <div className={compact ? "space-y-1" : "min-h-[4.25rem] space-y-1"}>
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
          compact ? "min-h-[10rem]" : "min-h-[360px]"
        }`}
      >
        {hasSelectedPreviews ? (
          <ImagePreviewGrid previews={selectedPreviews} spec={spec} />
        ) : showCurrent ? (
          <ImagePreview
            alt={`${label} preview`}
            src={currentUrl ?? ""}
            spec={spec}
          />
        ) : (
          <ImagePreview alt={`${label} upload placeholder`} spec={spec} />
        )}
      </div>
      <div className="min-h-9">
        {showCurrent ? (
          <button
            type="button"
            onClick={() => setRemoved(true)}
            className="h-9 rounded-md border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
          >
            Remove
          </button>
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
      <input
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
            replaceFileInputFiles(input, resizedFiles)
            setSelectedFiles(resizedFiles)
            setSelectedPreviews(createImagePreviews(resizedFiles))
            setUploadMessage(`Ready to upload at ${spec.width}px x ${spec.height}px.`)
          } catch (error) {
            input.value = ""
            setSelectedFiles([])
            setSelectedPreviews([])
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
        <p className="text-xs font-medium text-emerald-700">{uploadMessage}</p>
      ) : null}
      {uploadError ? (
        <p className="text-xs font-medium text-rose-700">{uploadError}</p>
      ) : null}
    </div>
  )
}

function CoverUploadField({ covers }: { covers?: string[] | null }) {
  const [removedUrls, setRemovedUrls] = useState<string[]>([])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [selectedPreviews, setSelectedPreviews] = useState<ImagePreview[]>([])
  const [uploadMessage, setUploadMessage] = useState("")
  const [uploadError, setUploadError] = useState("")
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
  const remainingCoverSlots = Math.max(maxCoverPhotos - visibleCovers.length, 0)

  useEffect(
    () => () => revokeImagePreviews(selectedPreviews),
    [selectedPreviews],
  )

  return (
    <div className="space-y-3 rounded-md border border-zinc-200 p-3 text-sm">
      <p className="font-medium text-zinc-700">Cover photos</p>
      <p className="text-xs text-zinc-500">
        {sizeHint}. Images are resized automatically before upload. Max{" "}
        {maxCoverPhotos} cover photos, 10 MB each.
      </p>
      <p className="text-xs font-medium text-zinc-500">
        {visibleCovers.length} of {maxCoverPhotos} cover photos saved
        {remainingCoverSlots ? `; ${remainingCoverSlots} slot${remainingCoverSlots === 1 ? "" : "s"} available.` : "."}
      </p>
      {hasSelectedPreviews ? (
        <ImagePreviewGrid previews={selectedPreviews} spec={spec} />
      ) : hasVisibleCovers ? (
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
              />
              <button
                type="button"
                onClick={() =>
                  setRemovedUrls((current) => [...current, coverUrl])
                }
                className="h-8 rounded-md border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
              >
                Remove
              </button>
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
        name="cover_files"
        type="file"
        accept={partnerMediaAccept}
        multiple
        disabled={remainingCoverSlots === 0}
        onChange={async (event) => {
          const input = event.currentTarget
          const files = Array.from(input.files ?? [])

          if (files.length === 0) {
            replaceFileInputFiles(input, selectedFiles)
            return
          }

          setUploadError("")
          setUploadMessage("Resizing cover photos...")

          if (files.length > remainingCoverSlots) {
            replaceFileInputFiles(input, selectedFiles)
            setUploadMessage("")
            setUploadError(
              `Select up to ${remainingCoverSlots} more cover photo${remainingCoverSlots === 1 ? "" : "s"}.`,
            )
            return
          }

          try {
            const resizedFiles = await resizeImageFiles(files, spec)
            replaceFileInputFiles(input, resizedFiles)
            setSelectedFiles(resizedFiles)
            setSelectedPreviews(createImagePreviews(resizedFiles))
            setUploadMessage(
              `${resizedFiles.length} cover photo${resizedFiles.length === 1 ? "" : "s"} ready at ${spec.width}px x ${spec.height}px.`,
            )
          } catch (error) {
            input.value = ""
            setSelectedFiles([])
            setSelectedPreviews([])
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

function ImagePreviewGrid({
  previews,
  spec,
}: {
  previews: ImagePreview[]
  spec: MediaSpec
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {previews.map((preview) => (
        <div key={preview.url} className="space-y-2">
          <ImagePreview
            alt={preview.name}
            src={preview.url}
            spec={spec}
            selected
          />
          <p className="truncate text-xs font-medium text-zinc-600">
            {preview.name}
          </p>
        </div>
      ))}
    </div>
  )
}

function ImagePreview({
  alt,
  src,
  spec,
  selected = false,
}: {
  alt: string
  src?: string
  spec: MediaSpec
  selected?: boolean
}) {
  return (
    <div
      className={`overflow-hidden rounded-md border ${
        selected ? "border-teal-200 bg-white" : "border-zinc-200 bg-white"
      }`}
      style={{
        aspectRatio: `${spec.width} / ${spec.height}`,
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
    </div>
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

function mediaSizeHint(spec: MediaSpec) {
  return `${spec.label} size: ${spec.width}px x ${spec.height}px`
}

async function resizeImageFiles(files: File[], spec: MediaSpec) {
  return await Promise.all(files.map((file) => resizeImageFile(file, spec)))
}

async function resizeImageFile(file: File, spec: MediaSpec) {
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

function ReadOnlyStatusField({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="flex min-h-10 items-start justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
      <span>
        <span className="block font-medium text-zinc-700">{label}</span>
        {hint ? <span className="block text-xs text-zinc-500">{hint}</span> : null}
      </span>
      <span className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs font-semibold text-zinc-700">
        {value}
      </span>
    </div>
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
  onChange,
}: {
  label: string
  name: string
  defaultValue?: string | null
  value?: string
  required?: boolean
  hint?: string
  placeholder?: string
  onChange?: (value: string) => void
}) {
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
        onChange={(event) => onChange?.(event.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
      />
      {hint ? <span className="block text-xs text-zinc-500">{hint}</span> : null}
    </label>
  )
}

function JsonTextAreaField({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string
  name: string
  defaultValue?: string | null
  placeholder?: string
}) {
  const [error, setError] = useState(() =>
    validateJsonInput(defaultValue ?? ""),
  )
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.setCustomValidity(error)
  }, [error])

  return (
    <label className="block space-y-2 text-sm">
      <FieldLabel label={label} />
      <textarea
        ref={textareaRef}
        name={name}
        rows={7}
        spellCheck={false}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        onInvalid={(event) => {
          const details = event.currentTarget.closest("details")

          if (details) {
            details.open = true
          }
        }}
        onBlur={(event) => {
          setError(validateJsonInput(event.target.value))
        }}
        onChange={(event) => {
          setError(validateJsonInput(event.target.value))
        }}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
      />
      {error ? (
        <span className="block text-xs font-medium text-rose-700">{error}</span>
      ) : (
        <span className="block text-xs text-zinc-500">
          Empty metadata saves as an empty JSON object.
        </span>
      )}
    </label>
  )
}

function FieldLabel({
  label,
  required,
}: {
  label: string
  required?: boolean
}) {
  return (
    <span className="font-medium text-zinc-700">
      {label}
      {required ? (
        <span className="ml-1 text-rose-600" aria-label="required">
          *
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
  pendingLabel,
  size = "default",
  tone = "default",
}: {
  label: string
  pendingLabel: string
  size?: "default" | "compact" | "tiny"
  tone?: "default" | "danger"
}) {
  const { pending } = useFormStatus()
  const sizeClasses =
    size === "tiny"
      ? "h-8 px-3 text-xs"
      : size === "compact"
        ? "h-9 px-3 text-sm"
        : "h-10 px-4 text-sm"

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${sizeClasses} rounded-md font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-zinc-300 ${
        tone === "danger"
          ? "bg-rose-700 hover:bg-rose-800"
          : "bg-teal-700 hover:bg-teal-800"
      }`}
    >
      {pending ? pendingLabel : label}
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

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 shadow-sm">
      {children}
    </span>
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

function formatDealSummary(deal: Deal) {
  const parts = [labelForValue(discountTypeOptions, deal.discount_type)]

  if (deal.discount_type === "item" && deal.reward_item) {
    parts.push(deal.reward_item)
  } else if (deal.discount_type === "bonus_stamp") {
    parts.push(`${deal.benefit_count ?? 1} stamp`)
  } else if (deal.discount_value !== null && deal.discount_value !== undefined) {
    parts.push(String(deal.discount_value))
  }

  return parts.join(" ") || "No discount details set"
}

function formatTimeRange(start?: string | null, end?: string | null) {
  if (!start && !end) {
    return "Not set"
  }

  return [start, end].filter(Boolean).join(" - ")
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

function formatTextInputValue(value?: string | number | null) {
  return value === null || value === undefined ? "" : String(value)
}

function parseOptionalNumberInput(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const numericValue = typeof value === "number" ? value : Number(value)

  return Number.isFinite(numericValue) ? numericValue : null
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

function validateJsonInput(value: string) {
  if (!value.trim()) {
    return ""
  }

  try {
    JSON.parse(value)
    return ""
  } catch {
    return "Metadata must be valid JSON."
  }
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
    return discountValue !== null ? `${discountValue} off` : "Fixed discount"
  }

  if (discountType === "twoforone" || discountType === "2for1") {
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

function formatSavingsPreview(value: number | null) {
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

  return discountType === "2for1" ? "twoforone" : discountType
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
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ""
  }
}

function formatJsonSummary(value: unknown) {
  if (!value) {
    return "Not set"
  }

  if (typeof value === "string") {
    return value || "Not set"
  }

  try {
    const serialized = JSON.stringify(value)
    return serialized.length > 80
      ? `${serialized.slice(0, 77)}...`
      : serialized
  } catch {
    return "Not set"
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

function uniqueOptions(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]),
  )
    .sort((first, second) => first.localeCompare(second))
    .map((value) => ({ value, label: value }))
}

function compareDate(value: string | null, inputDate: string) {
  if (!value) {
    return -1
  }

  const eventTime = new Date(value).getTime()
  const filterTime = new Date(inputDate).getTime()

  if (Number.isNaN(eventTime) || Number.isNaN(filterTime)) {
    return 0
  }

  return eventTime - filterTime
}
