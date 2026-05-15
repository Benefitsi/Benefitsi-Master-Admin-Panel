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
import type { City, Deal, OwnerOption, PartnerWithDeals } from "@/lib/admin-data"
import {
  deleteDeal,
  deletePartner,
  saveDeal,
  savePartner,
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

const dealTypeOptions = [
  { value: "2 For 1", label: "2 For 1" },
  { value: "Happy Hour", label: "Happy Hour" },
  { value: "Comeback", label: "Comeback" },
  { value: "Streak", label: "Streak" },
]

const discountTypeOptions = [
  { value: "Fixed", label: "Fixed" },
  { value: "Percent", label: "Percent" },
  { value: "2 For 1", label: "2 For 1" },
  { value: "Item", label: "Item" },
  { value: "Benefit", label: "Benefit" },
]

const partnerMediaAccept = "image/png,image/jpeg,image/webp,image/svg+xml"
const uploadPlaceholderSrc = "/upload-image.jpg"

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
    previewMaxWidth: 190,
    previewFit: "contain",
  },
  feature: {
    label: "Feature",
    width: 720,
    height: 450,
    previewMaxWidth: 320,
    previewFit: "cover",
  },
  cover: {
    label: "Cover",
    width: 750,
    height: 1658,
    previewMaxWidth: 180,
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
  premiumOnly: boolean
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
      <div className="grid gap-4 sm:grid-cols-3">
        <LiveMetric label="Partners" value={partnerCount} />
        <LiveMetric label="Active partners" value={activePartners} />
        <LiveMetric label="Deals" value={dealCount} />
      </div>

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

function PartnerListButton({
  partner,
  selected,
  onSelect,
}: {
  partner: PartnerWithDeals
  selected: boolean
  onSelect: () => void
}) {
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
          <p className="mt-2 text-xs font-medium text-zinc-600">
            {partner.deals.length} {partner.deals.length === 1 ? "deal" : "deals"}
          </p>
        </div>
      </div>
    </button>
  )
}

function PartnerDetail({
  partner,
  cities,
  owners,
}: {
  partner: PartnerWithDeals
  cities: City[]
  owners: OwnerOption[]
}) {
  return (
    <div className="space-y-5">
      <EditorShell
        title={partner.name || "Untitled partner"}
        description="Edit partner details, contact information, media, rewards, and Supabase routing fields."
        aside={
          <div className="flex flex-wrap gap-2">
            <StatusPill active={isPartnerActive(partner)} />
            {partner.is_featured ? <Badge>Featured</Badge> : null}
            {partner.is_restaurant ? <Badge>Restaurant</Badge> : null}
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

      <EditorShell
        title="Remove partner"
        description="Deleting a partner also removes its attached deals from Supabase."
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
            defaultValue={partner?.type ?? "Restaurant"}
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
        <div className="grid gap-3 sm:grid-cols-3">
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
          <CheckboxField
            label="Restaurant"
            name="is_restaurant"
            defaultChecked={partner?.is_restaurant ?? false}
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
        <FieldGrid>
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
        </FieldGrid>
        <CoverUploadField
          key={`covers-${partner?.cover_urls?.join("|") ?? "new"}`}
          covers={partner?.cover_urls}
        />
      </FormSection>

      <FormSection title="Rewards and Internal Settings">
        <FieldGrid>
          <TextField
            label="Stamp target"
            name="stamp_target"
            type="number"
            defaultValue={partner?.stamp_target ?? 10}
            required
          />
          <TextField
            label="Stamp reward 1"
            name="reward_text_primary"
            defaultValue={partner?.reward_text_primary}
            required
          />
          <TextField
            label="Stamp reward 2"
            name="reward_text_secondary"
            defaultValue={partner?.reward_text_secondary}
            required
          />
          {mode === "edit" ? (
            <ReadOnlyField label="Partner PIN" value={partner?.pin ?? "Not set"} />
          ) : null}
        </FieldGrid>
      </FormSection>

      {mode === "create" ? (
        <FormSection title="Initial Deals">
          <InitialDealsEditor
            deals={initialDeals}
            onAdd={() =>
              setInitialDeals((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  active: true,
                  premiumOnly: true,
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
                defaultPremiumOnly={deal.premiumOnly}
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

function DealsPanel({ partner }: { partner: PartnerWithDeals }) {
  const [showNewDeal, setShowNewDeal] = useState(partner.deals.length === 0)
  const partnerId = partner.id ?? ""

  return (
    <EditorShell
      title="Deals"
      description="Each partner can have multiple deals. Add a deal, then edit or remove it from its card."
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
        {showNewDeal && partnerId ? (
          <DealFormShell title="Add deal">
            <DealForm partnerId={partnerId} mode="create" />
          </DealFormShell>
        ) : null}

        {partner.deals.length ? (
          <div className="grid gap-4 2xl:grid-cols-2">
            {partner.deals.map((deal) => (
              <DealCard
                key={deal.id ?? `${deal.partner_id}-${deal.type}`}
                deal={deal}
                partnerId={partnerId}
              />
            ))}
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
          {deal.premium_only ? <Badge>Premium</Badge> : null}
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
        <Info
          label="Happy hour"
          value={formatTimeRange(deal.happy_hour_start, deal.happy_hour_end)}
        />
        <Info label="Reward" value={deal.reward_item || "Not set"} />
        <Info label="Trigger" value={formatOptionalNumber(deal.trigger_value)} />
        <Info
          label="Expires"
          value={deal.expiry_days ? `${deal.expiry_days} days` : "Not set"}
        />
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
        defaultPremiumOnly={deal?.premium_only ?? mode === "create"}
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
  defaultPremiumOnly,
}: {
  deal?: Deal
  prefix?: string
  defaultActive: boolean
  defaultPremiumOnly: boolean
}) {
  const [selectedDealType, setSelectedDealType] = useState(deal?.type ?? "")
  const [selectedDiscountType, setSelectedDiscountType] = useState(
    deal?.discount_type ?? "",
  )
  const hasDealType = Boolean(selectedDealType)
  const isTwoForOne = selectedDealType === "2 For 1"
  const isHappyHour = selectedDealType === "Happy Hour"
  const hasExpiryRule =
    selectedDealType === "Comeback" || selectedDealType === "Streak"
  const showsDiscountValue =
    selectedDiscountType &&
    selectedDiscountType !== "Item" &&
    selectedDiscountType !== "Benefit"
  const showsRewardItem = selectedDiscountType === "Item"
  const showsBenefitCount = selectedDiscountType === "Benefit"

  return (
    <div className="space-y-5">
      <FormSection title="Deal Details">
        <FieldGrid>
          <SelectField
            label="Deal type"
            name={`${prefix}type`}
            defaultValue={deal?.type}
            options={withCurrentOption(dealTypeOptions, deal?.type)}
            onChange={setSelectedDealType}
            required
          />
          {hasDealType ? (
            <SelectField
              label="Discount type"
              name={`${prefix}discount_type`}
              defaultValue={deal?.discount_type}
              options={withCurrentOption(
                discountTypeOptions,
                deal?.discount_type,
              )}
              onChange={setSelectedDiscountType}
            />
          ) : null}
          {showsDiscountValue ? (
            <TextField
              label="Discount value"
              name={`${prefix}discount_value`}
              type="number"
              defaultValue={deal?.discount_value}
            />
          ) : null}
          {showsRewardItem ? (
            <TextField
              label="Reward item"
              name={`${prefix}reward_item`}
              defaultValue={deal?.reward_item}
            />
          ) : null}
          {showsBenefitCount ? (
            <TextField
              label="Stamp reward count"
              name={`${prefix}benefit_count`}
              type="number"
              defaultValue={deal?.benefit_count}
            />
          ) : null}
        </FieldGrid>
        {hasDealType ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <CheckboxField
              label="Active"
              name={`${prefix}active`}
              defaultChecked={defaultActive}
            />
            <CheckboxField
              label="Premium only"
              name={`${prefix}premium_only`}
              defaultChecked={defaultPremiumOnly}
            />
          </div>
        ) : null}
      </FormSection>

      {isHappyHour || hasExpiryRule ? (
        <FormSection title="Timing and Rules">
          <FieldGrid>
            {isHappyHour ? (
              <>
                <TextField
                  label="Happy hour start"
                  name={`${prefix}happy_hour_start`}
                  type="time"
                  defaultValue={deal?.happy_hour_start}
                />
                <TextField
                  label="Happy hour end"
                  name={`${prefix}happy_hour_end`}
                  type="time"
                  defaultValue={deal?.happy_hour_end}
                />
              </>
            ) : null}
            {hasExpiryRule ? (
              <>
                <TextField
                  label="Trigger value"
                  name={`${prefix}trigger_value`}
                  type="number"
                  defaultValue={deal?.trigger_value}
                />
                <TextField
                  label="Expiry days"
                  name={`${prefix}expiry_days`}
                  type="number"
                  defaultValue={deal?.expiry_days}
                />
              </>
            ) : null}
          </FieldGrid>
        </FormSection>
      ) : null}

      {isTwoForOne ? (
        <FormSection title="2-for-1 Settings">
          <FieldGrid>
            <TextField
              label="Deal usage limit"
              name={`${prefix}twoforone_usage_limit`}
              type="number"
              defaultValue={deal?.twoforone_usage_limit}
            />
            <TextField
              label="Deal free trial limit"
              name={`${prefix}twoforone_trial_limit`}
              type="number"
              defaultValue={deal?.twoforone_trial_limit}
            />
            <TextField
              label="2-for-1 savings"
              name={`${prefix}estimated_savings`}
              type="number"
              step="any"
              defaultValue={deal?.estimated_savings}
            />
          </FieldGrid>
        </FormSection>
      ) : null}
    </div>
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
        label="Delete deal"
        pendingLabel="Deleting deal..."
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
  hint?: string
  required?: boolean
  placeholder?: string
  defaultValue?: string | number | null
}

function TextField({
  label,
  name,
  type = "text",
  step,
  hint,
  required,
  placeholder,
  defaultValue,
}: TextFieldProps) {
  return (
    <label className="block space-y-2 text-sm">
      <FieldLabel label={label} required={required} />
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
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
  required,
  onChange,
}: {
  label: string
  name: string
  options: { value: string; label: string }[]
  defaultValue?: string | null
  required?: boolean
  onChange?: (value: string) => void
}) {
  return (
    <label className="block space-y-2 text-sm">
      <FieldLabel label={label} required={required} />
      <select
        name={name}
        required={required}
        defaultValue={defaultValue ?? ""}
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
  options: { value: string; label: string }[]
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

function MediaUploadField({
  label,
  fileName,
  existingName,
  removeName,
  currentUrl,
  spec,
}: {
  label: string
  fileName: string
  existingName: string
  removeName: string
  currentUrl?: string | null
  spec: MediaSpec
}) {
  const [removed, setRemoved] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [selectedPreviews, setSelectedPreviews] = useState<ImagePreview[]>([])
  const [uploadMessage, setUploadMessage] = useState("")
  const [uploadError, setUploadError] = useState("")
  const hasSelectedPreviews = selectedPreviews.length > 0
  const showCurrent = Boolean(currentUrl) && !removed && !hasSelectedPreviews
  const showPlaceholder = !showCurrent && !hasSelectedPreviews
  const sizeHint = mediaSizeHint(spec)

  useEffect(
    () => () => revokeImagePreviews(selectedPreviews),
    [selectedPreviews],
  )

  return (
    <div className="space-y-3 rounded-md border border-zinc-200 p-3 text-sm">
      <p className="font-medium text-zinc-700">{label}</p>
      <p className="text-xs text-zinc-500">
        {sizeHint}. Images are resized automatically before upload. Max 10 MB.
      </p>
      {currentUrl && !removed ? (
        <input type="hidden" name={existingName} value={currentUrl} />
      ) : null}
      {selectedPreviews.length ? (
        <ImagePreviewGrid previews={selectedPreviews} spec={spec} />
      ) : null}
      {showCurrent ? (
        <>
          <ImagePreview
            alt={`${label} preview`}
            src={currentUrl ?? ""}
            spec={spec}
          />
          <button
            type="button"
            onClick={() => setRemoved(true)}
            className="h-9 rounded-md border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
          >
            Remove
          </button>
        </>
      ) : null}
      {showPlaceholder ? (
        <ImagePreview alt={`${label} upload placeholder`} spec={spec} />
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

  useEffect(
    () => () => revokeImagePreviews(selectedPreviews),
    [selectedPreviews],
  )

  return (
    <div className="space-y-3 rounded-md border border-zinc-200 p-3 text-sm">
      <p className="font-medium text-zinc-700">Cover photos</p>
      <p className="text-xs text-zinc-500">
        {sizeHint}. Images are resized automatically before upload. Max 10 MB each.
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
        onChange={async (event) => {
          const input = event.currentTarget
          const files = Array.from(input.files ?? [])

          if (files.length === 0) {
            replaceFileInputFiles(input, selectedFiles)
            return
          }

          setUploadError("")
          setUploadMessage("Resizing cover photos...")

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
}: {
  label: string
  value: string | number | null
}) {
  return (
    <div className="block space-y-2 text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      <div className="flex h-10 items-center rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-700">
        {value ?? "Not set"}
      </div>
    </div>
  )
}

function TextAreaField({
  label,
  name,
  defaultValue,
  required,
}: {
  label: string
  name: string
  defaultValue?: string | null
  required?: boolean
}) {
  return (
    <label className="block space-y-2 text-sm">
      <FieldLabel label={label} required={required} />
      <textarea
        name={name}
        rows={4}
        required={required}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
      />
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
}: {
  label: string
  name: string
  defaultChecked: boolean
}) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 rounded border-zinc-300 accent-teal-700"
      />
      {label}
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
  tone = "default",
}: {
  label: string
  pendingLabel: string
  tone?: "default" | "danger"
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className={`h-10 rounded-md px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-zinc-300 ${
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
      className={`rounded-md px-2 py-1 text-xs font-semibold ${
        active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  )
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
      {children}
    </span>
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
  const parts = [
    labelForValue(discountTypeOptions, deal.discount_type),
    formatOptionalNumber(deal.discount_value),
  ].filter((value) => value && value !== "Not set")

  return parts.join(" ") || "No discount details set"
}

function formatTimeRange(start?: string | null, end?: string | null) {
  if (!start && !end) {
    return "Not set"
  }

  return [start, end].filter(Boolean).join(" - ")
}

function formatOptionalNumber(value?: number | null) {
  return value === null || value === undefined ? "Not set" : String(value)
}

function withCurrentOption(
  options: { value: string; label: string }[],
  current?: string | null,
) {
  if (!current || options.some((option) => option.value === current)) {
    return options
  }

  return [{ value: current, label: current }, ...options]
}

function withCurrentOptions(
  options: { value: string; label: string }[],
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
  options: { value: string; label: string }[],
  value?: string | null,
) {
  return options.find((option) => option.value === value)?.label ?? value ?? ""
}
