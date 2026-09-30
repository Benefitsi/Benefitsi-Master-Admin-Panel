'use client'
import { useActionState, useEffect, useState, useCallback } from 'react'
import {
  loadPartnerPlanPanel,
  updatePartnerPlan,
  loadPartnerDashboardPreview,
} from '@/app/partner/plan-actions'
import {
  featureLabels,
  limitLabels,
  type BillingSummary,
  type PlanPanel,
  type PriceOffer,
} from '@/lib/partners/entitlements'
import { PartnerStatistics } from '@/components/partner/partner-statistics'
import { formatBerlin, type Dashboard } from '@/lib/partners/analytics'
const input =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm focus:outline-2 focus:outline-sky-500'
const box = 'rounded-2xl border border-slate-200 bg-white p-5 sm:p-6'
const button =
  'rounded-lg bg-[#087cd9] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50'
export function priceLabel(offer: PriceOffer) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: offer.currency,
  }).format(offer.unit_amount / 100)
}
const states: Record<string, string> = {
  free: 'Free',
  subscription: 'Aktives Abo',
  trial: 'Testphase',
  manual_grant: 'Kostenlose Admin-Freigabe',
  past_due_grace: 'Zahlung ausstehend · Übergangsfrist',
  cancel_at_period_end: 'Zum Periodenende gekündigt',
}
const reasons: Record<string, string> = {
  free: 'Tarifstandard Free',
  subscription: 'Tarifstandard Pro',
  trial: 'Testphase',
  manual_grant: 'Kostenlose Testfreigabe',
  admin_grant: 'Befristete Ausnahme',
  admin_deny: 'Admin-Sperre',
  legacy_menu_ai_import_grant: 'Bestehende befristete Freigabe',
  plan_required: 'Zusätzlicher Tarif erforderlich',
  release_blocked: 'Noch nicht freigegeben',
  not_ready: 'Noch nicht verfügbar',
  provider_not_ready: 'Einrichtung fehlt',
  owner_required: 'Inhaberzugang erforderlich',
  operational_deny: 'Betriebliche Sperre',
  publication_blocked: 'Betrieb noch nicht freigegeben',
  addon: 'Zusatzmodul',
}
export function PartnerPlanSummary({ data }: { data: BillingSummary }) {
  const rights = data.entitlements,
    sub = data.subscription
  return (
    <div className="space-y-5">
      <section className={box}>
        <p className="text-xs font-bold uppercase tracking-widest text-sky-700">
          Tarif & Module
        </p>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-3xl font-bold">
            Benefitsi {rights.plan_code === 'pro' ? 'Pro' : 'Free'}
          </h2>
          <span className="rounded-full bg-sky-50 px-3 py-1 text-sm text-sky-900">
            {states[rights.state] ?? 'Status wird geprüft'}
          </span>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          {rights.plan_code === 'free'
            ? 'Dein Standardprofil in der Stadt. Profil, Menü und Öffnungszeiten bleiben manuell bearbeitbar.'
            : 'Eigene Microsite und erweiterte Auswertungen. Layout und Veröffentlichung betreut das Benefitsi-Team.'}
        </p>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Aktuelles Preisangebot</dt>
            <dd className="font-semibold">
              {sub?.offer
                ? `${sub.offer.offer_code === 'founder' ? 'Founder' : 'Standard'} · ${priceLabel(sub.offer)} / Monat zzgl. MwSt. · Version ${sub.offer.version}`
                : sub?.source === 'admin_freegrant'
                  ? 'Kostenlos · keine Rechnung'
                  : 'Free · kostenlos'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Nächster Ablauf einer Freigabe</dt>
            <dd>
              {rights.valid_until
                ? `${formatBerlin(rights.valid_until)} · kann eine einzelne Funktion betreffen`
                : 'Kein befristeter Ablauf'}
            </dd>
          </div>
          {sub && (
            <>
              <div>
                <dt className="text-slate-500">
                  {sub.source === 'admin_freegrant'
                    ? 'Freigabezeitraum'
                    : 'Abrechnungszeitraum'}
                </dt>
                <dd>
                  {formatBerlin(sub.period_start)} –{' '}
                  {formatBerlin(sub.period_end)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Zahlungsstatus</dt>
                <dd>
                  {sub.source === 'admin_freegrant'
                    ? 'Admin-Testfreigabe ohne Rechnung'
                    : sub.payment_status === 'past_due'
                      ? 'Zahlung ausstehend'
                      : sub.paid_through
                        ? `Bezahlt bis ${formatBerlin(sub.paid_through)}`
                        : 'Noch keine bestätigte Zahlung'}
                </dd>
              </div>
              {(sub.trial_end || sub.first_payment_at) && (
                <div>
                  <dt className="text-slate-500">
                    Testphase / erster Zahlungstermin
                  </dt>
                  <dd>
                    {sub.trial_end
                      ? `Testphase bis ${formatBerlin(sub.trial_end)}. `
                      : ''}
                    {sub.first_payment_at
                      ? formatBerlin(sub.first_payment_at)
                      : 'Erster Zahlungstermin noch nicht bestätigt'}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-slate-500">Kündigung</dt>
                <dd>
                  {sub.cancel_at_period_end
                    ? `Zum ${formatBerlin(sub.period_end)}`
                    : 'Keine Kündigung zum Periodenende'}
                </dd>
              </div>
            </>
          )}
        </dl>
      </section>
      <section className={box}>
        <h3 className="font-bold">Deine Funktionen</h3>
        <ul className="mt-3 divide-y divide-slate-100">
          {Object.entries(featureLabels).map(([key, label]) => (
            <li
              key={key}
              className="flex flex-wrap justify-between gap-2 py-3 text-sm"
            >
              <span>{label}</span>
              <span className="text-right">
                <strong
                  className={
                    rights.features[key] ? 'text-emerald-700' : 'text-slate-500'
                  }
                >
                  {rights.features[key]
                    ? 'Freigeschaltet'
                    : 'Nicht freigeschaltet'}
                </strong>
                <small className="block text-slate-500">
                  {reasons[rights.reason_codes[key]] ??
                    'Tarifabhängige Freigabe'}
                </small>
                {data.feature_exceptions
                  ?.filter((e) => e.feature_key === key)
                  .map((e) => (
                    <small key={e.source} className="block text-slate-500">
                      {e.source === 'admin'
                        ? 'Admin-Ausnahme'
                        : 'Bestehende Freigabe'}{' '}
                      · {e.effect === 'deny' ? 'Sperre' : 'Erlaubnis'} bis{' '}
                      {formatBerlin(e.valid_until)}
                    </small>
                  ))}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className={box}>
        <h3 className="font-bold">Kontingente</h3>
        <dl className="mt-4 grid grid-cols-2 gap-4">
          {Object.entries(limitLabels).map(([key, label]) => (
            <div key={key}>
              <dt className="text-sm text-slate-500">{label}</dt>
              <dd className="text-2xl font-bold">
                {rights.limits[key] ?? '—'}
              </dd>
            </div>
          ))}
        </dl>
        {data.usage.length ? (
          data.usage.map((u) => (
            <p key={u.period_start} className="mt-4 text-sm">
              KI-Importe: {u.used} belegt, davon {u.reserved} in Bearbeitung ·{' '}
              {formatBerlin(u.period_start)} – {formatBerlin(u.period_end)}
            </p>
          ))
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Keine KI-Importe im laufenden Kontingentzeitraum belegt.
          </p>
        )}
      </section>
      <section className={box}>
        <h3 className="font-bold">Veröffentlichte Preisangebote</h3>
        <p className="mt-1 text-sm text-slate-500">
          Neue Angebote ändern dein bestehendes Abo nicht. Buchung und
          Zahlungsverwaltung sind noch nicht verfügbar.
        </p>
        <ul className="mt-4 space-y-3">
          {data.catalog.offers.map((o) => (
            <li
              key={`${o.offer_code}-${o.version}`}
              className="flex flex-wrap justify-between gap-2 text-sm"
            >
              <span>
                {
                  (
                    {
                      standard: 'Pro Standard',
                      founder: 'Pro Founder',
                      commerce: 'Bestellungen & Termine',
                      seo: 'SEO-Monitoring',
                    } as Record<string, string>
                  )[o.offer_code]
                }{' '}
                · v{o.version}
              </span>
              <strong>
                {priceLabel(o)} / Monat zzgl. MwSt.
                {o.setup_amount > 0
                  ? ` + ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: o.currency }).format(o.setup_amount / 100)} Einrichtung`
                  : ''}
              </strong>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
function Field({
  label,
  name,
  type = 'text',
  value,
  min,
  step,
}: {
  label: string
  name: string
  type?: string
  value?: string | number
  min?: number
  step?: string
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        className={input}
        name={name}
        type={type}
        defaultValue={value}
        min={min}
        step={step}
        required
      />
    </label>
  )
}
function ChangeForm({
  operation,
  partnerId,
  children,
  label = 'Speichern',
  onSaved,
}: {
  operation: string
  partnerId: string
  children: React.ReactNode
  label?: string
  onSaved: () => void
}) {
  const [state, action, pending] = useActionState(updatePartnerPlan, {
    ok: false,
    message: '',
  })
  useEffect(() => {
    if (state.ok) onSaved()
  }, [state, onSaved])
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="partner_id" value={partnerId} />
      {children}
      <Field label="Grund der Änderung" name="reason" />
      <p
        role="status"
        className={
          state.ok ? 'text-sm text-emerald-800' : 'text-sm text-rose-700'
        }
      >
        {state.message}
      </p>
      <button className={button} disabled={pending}>
        {pending ? 'Wird gespeichert …' : label}
      </button>
    </form>
  )
}
export function PartnerPlanPanel({
  partnerId,
  initialData,
}: {
  partnerId: string
  initialData?: PlanPanel
}) {
  const [data, setData] = useState<PlanPanel | undefined>(initialData),
    [error, setError] = useState(''),
    [generation, setGeneration] = useState(0)
  const [mode, setMode] = useState('standard')
  const [preview, setPreview] = useState<Dashboard | null>(null),
    [previewError, setPreviewError] = useState(''),
    [previewPending, setPreviewPending] = useState(false)
  // Identity-bound loading prevents a previous partner's panel from flashing after selection changes.
  useEffect(() => {
    if (initialData) return
    let alive = true
    loadPartnerPlanPanel(partnerId)
      .then((value) => {
        if (alive) {
          setData(value)
          setError('')
        }
      })
      .catch(() => {
        if (alive)
          setError(
            'Tarifdaten konnten nicht geladen werden. Bitte erneut versuchen.',
          )
      })
    return () => {
      alive = false
    }
  }, [partnerId, generation, initialData])
  const reload = useCallback(() => setGeneration((n) => n + 1), [])
  if (!data || data.entitlements.partner_id !== partnerId)
    return (
      <div className={box}>
        <p role="status">{error || 'Tarifdaten werden geladen …'}</p>
        {error && (
          <button className={button} onClick={reload}>
            Erneut versuchen
          </button>
        )}
      </div>
    )
  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-sky-50 p-4 text-sm text-sky-950">
        Sichere Admin-Vorschau der wirksamen Partnerrechte. Du bleibst im
        Admin-Bereich; Partner-Sitzungen werden nicht übernommen.
      </div>
      <PartnerPlanSummary data={data} />
      <section className={box}>
        <h3 className="mb-3 text-lg font-bold">
          Partneransicht · letzte 7 Tage
        </h3>
        <button
          type="button"
          disabled={previewPending}
          className={button}
          onClick={async () => {
            setPreviewPending(true)
            setPreviewError('')
            try {
              setPreview(await loadPartnerDashboardPreview(partnerId))
            } catch {
              setPreview(null)
              setPreviewError(
                'Die Partnerstatistik ist aktuell nicht verfügbar oder gesperrt.',
              )
            } finally {
              setPreviewPending(false)
            }
          }}
        >
          {previewPending
            ? 'Vorschau wird geladen …'
            : 'Sichere Statistikvorschau laden'}
        </button>
        {previewError && (
          <p role="alert" className="mt-3 text-sm text-amber-900">
            {previewError}
          </p>
        )}
        {preview?.partner_id === partnerId && (
          <div className="mt-4">
            <PartnerStatistics data={preview} compact />
          </div>
        )}
      </section>
      <section className={box}>
        <h3 className="mb-4 text-lg font-bold">Befristete Ausnahme</h3>
        <ChangeForm operation="override" partnerId={partnerId} onSaved={reload}>
          <label className="block text-sm font-medium">
            Funktion oder Kontingent
            <select name="feature" className={input}>
              {Object.entries({ ...featureLabels, ...limitLabels }).map(
                ([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Regel
            <select
              className={input}
              name="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="standard">Tarifstandard wiederherstellen</option>
              <option value="allow">Befristet erlauben</option>
              <option value="deny">Sperren</option>
              <option value="limit">Kontingent befristet ändern</option>
            </select>
          </label>
          {mode !== 'standard' && (
            <Field
              label="Ablaufdatum (00:00 Uhr Berlin)"
              name="valid_until"
              type="date"
            />
          )}
          {mode === 'limit' && (
            <Field label="Kontingent" name="limit" type="number" min={0} />
          )}
          <p className="text-sm text-slate-500">
            Tarifstandard entfernt die Admin-Ausnahme mit Audit. Andere
            bestehende Freigaben bleiben erhalten. Kontingentänderungen
            verwenden die Regel „Kontingent“.
          </p>
        </ChangeForm>
        <ul className="mt-5 space-y-2 text-sm">
          {data.overrides.map((o) => (
            <li key={o.feature_key + o.source}>
              <strong>
                {featureLabels[o.feature_key] ?? limitLabels[o.feature_key]}
              </strong>
              :{' '}
              {o.effect === 'deny'
                ? 'Gesperrt'
                : o.effect === 'limit'
                  ? o.limit_value
                  : 'Erlaubt'}{' '}
              · {o.source === 'admin' ? 'Admin' : 'Bestehende Freigabe'} · bis{' '}
              {formatBerlin(o.valid_until)} · {o.reason}
            </li>
          ))}
        </ul>
      </section>
      <section className={box}>
        <h3 className="mb-4 text-lg font-bold">Kostenlose Pro-Testfreigabe</h3>
        <p className="mb-4 text-sm text-slate-500">
          Erzeugt keine Rechnung. Ein bestehendes kommerzielles Abo wird nicht
          überschrieben.
        </p>
        <ChangeForm operation="grant" partnerId={partnerId} onSaved={reload}>
          <Field
            label="Pro-Tarifversion"
            name="plan_version"
            type="number"
            min={1}
            value={1}
          />
          <Field
            label="Ablaufdatum (00:00 Uhr Berlin)"
            name="valid_until"
            type="date"
          />
        </ChangeForm>
      </section>
      <section className={box}>
        <h3 className="mb-4 text-lg font-bold">Neues Preisangebot entwerfen</h3>
        <ChangeForm
          operation="draft_offer"
          partnerId={partnerId}
          onSaved={reload}
          label="Entwurf zur Prüfung speichern"
        >
          <label className="text-sm font-medium">
            Angebot
            <select name="offer_code" className={input}>
              <option value="standard">Pro Standard</option>
              <option value="founder">Pro Founder</option>
              <option value="commerce">Bestellungen & Termine</option>
              <option value="seo">SEO-Monitoring</option>
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Neue Angebotsversion"
              name="version"
              type="number"
              min={1}
            />
            <Field
              label="Pro-Tarifversion (für Pro-Angebote)"
              name="plan_version"
              type="number"
              min={1}
              value={1}
            />
            <Field
              label="Monatspreis in EUR, zzgl. MwSt."
              name="amount"
              type="number"
              min={0}
              step="0.01"
            />
            <Field
              label="Einrichtung in EUR, zzgl. MwSt."
              name="setup"
              type="number"
              min={0}
              step="0.01"
              value={0}
            />
          </div>
        </ChangeForm>
      </section>
      <section className={box}>
        <h3 className="mb-4 text-lg font-bold">Tarifversion entwerfen</h3>
        <ChangeForm
          operation="draft_plan"
          partnerId={partnerId}
          onSaved={reload}
          label="Entwurf zur Prüfung speichern"
        >
          <label className="text-sm font-medium">
            Tarif
            <select name="plan_code" className={input}>
              <option value="pro">Pro</option>
              <option value="free">Free</option>
            </select>
          </label>
          <Field
            label="Neue Tarifversion"
            name="version"
            type="number"
            min={1}
          />
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-3 font-semibold">Funktionen</legend>
            {Object.entries(featureLabels)
              .filter(([key]) => !['commerce', 'seo.monitor'].includes(key))
              .map(([key, label]) => (
                <label
                  key={key}
                  className="flex min-h-11 cursor-pointer items-center rounded-lg px-2 text-sm hover:bg-slate-50"
                >
                  <input type="checkbox" name={key} className="mr-2" />
                  {label}
                </label>
              ))}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(limitLabels).map(([key, label]) => (
              <Field key={key} label={label} name={key} type="number" min={0} />
            ))}
          </div>
          <p className="text-sm text-slate-500">
            Free enthält keine eigene Microsite oder erweiterten Medien.
            Zusatzmodule werden separat freigegeben. Laufende Pro-Verträge
            bleiben an ihre Tarifversion gebunden.
          </p>
        </ChangeForm>
      </section>
      <section className={box}>
        <h3 className="mb-4 text-lg font-bold">Entwürfe prüfen & freigeben</h3>
        {data.drafts.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Entwürfe vorhanden.</p>
        ) : (
          data.drafts.map((d) => (
            <article
              key={d.id}
              className="mb-5 rounded-xl border border-slate-200 p-4"
            >
              <h4 className="font-semibold">
                {d.kind === 'offer' ? 'Preisangebot' : 'Tarif'}{' '}
                {String(d.payload.offer_code ?? d.payload.plan_code)} · Version{' '}
                {String(d.payload.version)} ·{' '}
                {d.status === 'draft'
                  ? 'Entwurf'
                  : d.status === 'published'
                    ? 'Freigegeben'
                    : 'Archiviert'}
              </h4>
              {d.kind === 'offer' ? (
                <p className="my-3 text-sm">
                  {new Intl.NumberFormat('de-DE', {
                    style: 'currency',
                    currency: 'EUR',
                  }).format(Number(d.payload.unit_amount) / 100)}{' '}
                  monatlich, zzgl. MwSt. · Einrichtung{' '}
                  {Number(d.payload.setup_amount ?? 0) / 100} EUR · Tarifversion{' '}
                  {String(d.payload.plan_version ?? 'Zusatzmodul')}
                </p>
              ) : (
                <ul className="my-3 grid gap-1 text-sm sm:grid-cols-2">
                  {Object.entries(
                    (d.payload.features ?? {}) as Record<string, boolean>,
                  ).map(([key, value]) => (
                    <li key={key}>
                      {featureLabels[key]}: {value ? 'Ja' : 'Nein'}
                    </li>
                  ))}
                  {Object.entries(
                    (d.payload.limits ?? {}) as Record<string, number>,
                  ).map(([key, value]) => (
                    <li key={key}>
                      {limitLabels[key]}: {value}
                    </li>
                  ))}
                </ul>
              )}
              {d.status === 'draft' && (
                <ChangeForm
                  operation="publish"
                  partnerId={partnerId}
                  onSaved={reload}
                  label="Geprüfte Version freigeben"
                >
                  <input type="hidden" name="draft_id" value={d.id} />
                </ChangeForm>
              )}
            </article>
          ))
        )}
      </section>
      <section className={box}>
        <h3 className="mb-4 text-lg font-bold">Katalogversion archivieren</h3>
        <p className="mb-4 text-sm text-slate-500">
          Archiviert die Version für neue Angebote. Bestehende Verträge bleiben
          unverändert. Die Free-Basisversion bleibt verfügbar.
        </p>
        <ChangeForm operation="archive" partnerId={partnerId} onSaved={reload}>
          <label className="text-sm">
            Typ
            <select name="kind" className={input}>
              <option value="offer">Preisangebot</option>
              <option value="plan">Tarif</option>
            </select>
          </label>
          <label className="text-sm">
            Code
            <select name="code" className={input}>
              {['standard', 'founder', 'commerce', 'seo', 'pro'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <Field label="Version" name="version" type="number" min={1} />
        </ChangeForm>
        <ul className="mt-4 text-sm">
          {data.archives.map((a) => (
            <li key={`${a.kind}-${a.code}-${a.version}`}>
              {a.code} · v{a.version} · Archiviert
            </li>
          ))}
        </ul>
      </section>
      <section className={box}>
        <h3 className="mb-4 text-lg font-bold">Änderungsverlauf</h3>
        <ol className="space-y-3">
          {data.audit.map((a, i) => (
            <li key={i} className="border-l-2 border-sky-200 pl-3 text-sm">
              <time>{formatBerlin(a.created_at)}</time> ·{' '}
              {a.source === 'admin' ? 'Benefitsi Admin' : 'Bestehende Freigabe'}
              <p>{a.reason}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
