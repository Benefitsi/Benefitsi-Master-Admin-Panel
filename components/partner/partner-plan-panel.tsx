"use client";
import { useActionState, useEffect, useState, useCallback } from "react";
import {
  loadPartnerPlanPanel,
  updatePartnerPlan,
  loadPartnerDashboardPreview,
} from "@/app/partner/plan-actions";
import {
  featureLabels,
  limitLabels,
  type BillingSummary,
  type PlanPanel,
  type PriceOffer,
} from "@/lib/partners/entitlements";
import { PartnerStatistics } from "@/components/partner/partner-statistics";
import { formatBerlin, type Dashboard } from "@/lib/partners/analytics";
const input =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm focus:outline-2 focus:outline-sky-500";
const box = "rounded-3xl border border-slate-200 bg-white p-5 sm:p-6";
const button =
  "rounded-lg bg-[#087cd9] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50";
export function priceLabel(offer: PriceOffer) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: offer.currency,
  }).format(offer.unit_amount / 100);
}
const states: Record<string, string> = {
  free: "Free",
  subscription: "Aktives Abo",
  trial: "Testphase",
  manual_grant: "Kostenlose Admin-Freigabe",
  past_due_grace: "Zahlung ausstehend · Übergangsfrist",
  cancel_at_period_end: "Zum Periodenende gekündigt",
};
const reasons: Record<string, string> = {
  free: "Tarifstandard Free",
  subscription: "Tarifstandard Pro",
  trial: "Testphase",
  manual_grant: "Kostenlose Testfreigabe",
  admin_grant: "Befristete Ausnahme",
  admin_deny: "Admin-Sperre",
  legacy_menu_ai_import_grant: "Bestehende befristete Freigabe",
  plan_required: "Zusätzlicher Tarif erforderlich",
  release_blocked: "Noch nicht freigegeben",
  not_ready: "Noch nicht verfügbar",
  provider_not_ready: "Einrichtung fehlt",
  owner_required: "Inhaberzugang erforderlich",
  operational_deny: "Betriebliche Sperre",
  publication_blocked: "Betrieb noch nicht freigegeben",
  addon: "Zusatzmodul",
  pro_required: "Aktiver Pro-Tarif erforderlich",
  verified_cost_required: "Kosten- und Betriebsfreigabe ausstehend",
  measurement_source_missing: "Messzugang noch nicht bereit",
  maximum_five_keywords: "SEO ist auf höchstens fünf Keywords begrenzt",
};
export function PartnerPlanSummary({ data }: { data: BillingSummary }) {
  const rights = data.entitlements,
    sub = data.subscription;
  const freeExit =
    !!sub?.trial_end &&
    !!data.founder_cancellation &&
    Date.parse(data.founder_cancellation.requested_at) <
      Date.parse(sub.trial_end) &&
    Date.parse(data.founder_cancellation.effective_at) <=
      Date.parse(sub.trial_end);
  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-[#061829] p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#17d4d7]">Dein Tarif</p>
            <h2 className="mt-2 text-3xl font-bold">
              Benefitsi {rights.plan_code === "pro" ? "Pro" : "Free"}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              {rights.plan_code === "pro"
                ? "Eigene Microsite und erweiterte Auswertungen."
                : "Dein Standardprofil auf der Stadtseite. Keine eigene Microsite."}
            </p>
          </div>
          <span className="rounded-xl bg-white/10 px-4 py-2 text-sm text-[#ffcf58]">
            {states[rights.state] ?? "Status wird geprüft"}
          </span>
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ["analytics_days", "Tage Auswertung"],
            ["deal_drops_monthly", "Deal Drops je Kalendermonat"],
            ["team_members", "Teammitglieder"],
          ].map(([key, label]) => (
            <div key={key} className="rounded-2xl bg-white/5 p-4">
              <dd className="text-3xl font-bold">
                {key === 'deal_drops_monthly' && rights.limits[key] === null ? 'Ohne Monatslimit (vorläufig)' : rights.limits[key] ?? '—'}
              </dd>
              <dt className="mt-1 text-sm text-slate-300">{label}</dt>
            </div>
          ))}
        </dl>
      </section>
      <section className={box}>
        <h3 className="text-lg font-bold">Vertrag & Abrechnung</h3>
        <p>Normale Angebote und Happy Hour ohne Mengenlimit. Der vereinbarte Vertragspreis bleibt auch bei Verlängerung bestehen; Änderungen benötigen ein neues Angebot und ausdrückliche Zustimmung.</p>
        {data.billing_readiness && !data.billing_readiness.enabled && (
          <p className="mt-3 text-sm text-amber-800">
            Abrechnung ist noch gesperrt.{" "}
            {data.billing_readiness.reason === "billing_portal_required"
              ? "Die Konfiguration des Rechnungsportals fehlt."
              : "Verbindliche Vertragsbedingungen und die Abrechnungsfreigabe müssen vor einem Checkout vorliegen."}
          </p>
        )}
        {data.founder_readiness === false && (
          <p className="mt-3 text-sm text-amber-800">
            Founder-Abschlüsse sind bis zur geprüften Konfiguration der
            Aktivierung, Gratis-Kündigung und bezahlten Mindestlaufzeit
            gesperrt.
          </p>
        )}
        {data.founder_activation_review?.required && (
          <p role="alert" className="mt-3 text-sm text-amber-800">
            Unerwartetes Abonnement beim Zahlungsdienstleister nach
            geschlossenem Founder-Abschluss. Benefitsi prüft Kündigung und
            mögliche Rechnung; daraus entstehen keine Pro-Rechte oder ein neuer
            Founder-Zeitraum.
          </p>
        )}
        {data.pending_founder && (
          <p className="mt-3 text-sm">
            Founder-Abschluss ausstehend.{" "}
            {data.pending_founder.planned_activation
              ? `Geplante Aktivierung: ${formatBerlin(data.pending_founder.planned_activation)}. Pro beginnt erst mit bestätigter Abo-Aktivierung. Der Abrechnungsabgleich prüft dies erneut.`
              : "Zahlungsmethode und Vereinbarung müssen noch bestätigt werden; die Gratisphase hat nicht begonnen."}
          </p>
        )}
        {data.founder_cancellation && (
          <p role="status" className="mt-3 text-sm text-amber-800">
            Kündigung eingegangen am{" "}
            {formatBerlin(data.founder_cancellation.requested_at)} zum{" "}
            {formatBerlin(data.founder_cancellation.effective_at)}.{" "}
            {data.billing_recovery?.pending
              ? "Abwicklung / Bestätigung ausstehend."
              : "Aktuellen Vertragsstatus unten beachten."}{" "}
            {data.founder_cancellation.billing_review_required &&
              "Benefitsi muss die Rechnung oder Zahlung nach dem rechtzeitigen Ausstieg prüfen und korrigieren; eine Erstattung ist noch nicht bestätigt."}
          </p>
        )}
        {sub?.activated_at && sub.trial_end && sub.paid_minimum_end && (
          <p className="mt-3 text-sm">
            Founder aktiviert: {formatBerlin(sub.activated_at)}. Gratisphase bis{" "}
            {formatBerlin(sub.trial_end)}.{" "}
            {freeExit
              ? "Rechtzeitiger Ausstieg aus der Gratisphase: Keine Verpflichtung zur bezahlten Zwölfmonatslaufzeit. Erste Zahlung entfällt; eine dennoch entstandene Abrechnung des Zahlungsdienstleisters wird gesondert geprüft."
              : `Nur bei Fortsetzung: erste Zahlung ${formatBerlin(sub.trial_end)} und zwölf Monate bezahlte Mindestlaufzeit bis ${formatBerlin(sub.paid_minimum_end)}.`}{" "}
            {sub.cancellation_at &&
              `Vereinbarte Kündigung: ${formatBerlin(sub.cancellation_at)}.`}
          </p>
        )}
        {data.billing_recovery?.pending && (
          <p role="alert" className="mt-3 text-sm text-amber-800">
            Eine Kündigungsbestätigung ist noch offen. Weitere
            Abrechnungsänderungen warten auf den Ergebnisabgleich. Du kannst den
            gespeicherten Auftrag unter „Abrechnung verwalten“ fortsetzen; der
            automatische Abgleich versucht dies ebenfalls. Bei anhaltendem
            Fehler prüft Benefitsi das protokollierte Ergebnis des
            Zahlungsdienstleisters.
          </p>
        )}
        {sub?.grace_until && (
          <p className="mt-3 text-sm text-amber-800">
            Übergangsfrist bei ausstehender Zahlung: bis{" "}
            {formatBerlin(sub.grace_until)}.
          </p>
        )}
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">
              {sub?.offer && rights.plan_code === "free"
                ? "Gespeichertes Vertragsangebot"
                : "Aktuelles Preisangebot"}
            </dt>
            <dd className="font-semibold">
              {sub?.offer
                ? `${sub.offer.offer_code.startsWith("founder") ? "Founder" : "Standard"} · ${priceLabel(sub.offer)} / ${sub.offer.billing_interval === "year" ? "Jahr im Voraus" : "Monat"} zzgl. MwSt.`
                : sub?.source === "admin_freegrant"
                  ? "Kostenlos · keine Rechnung"
                  : "Free · kostenlos"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Nächster Ablauf einer Freigabe</dt>
            <dd>
              {rights.valid_until
                ? `${formatBerlin(rights.valid_until)} · kann eine einzelne Funktion betreffen`
                : "Kein befristeter Ablauf"}
            </dd>
          </div>
          {sub && (
            <>
              <div>
                <dt className="text-slate-500">
                  {sub.source === "admin_freegrant"
                    ? "Freigabezeitraum"
                    : "Abrechnungszeitraum"}
                </dt>
                <dd>
                  {formatBerlin(sub.period_start)} –{" "}
                  {formatBerlin(sub.period_end)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Zahlungsstatus</dt>
                <dd>
                  {sub.source === "admin_freegrant"
                    ? "Admin-Testfreigabe ohne Rechnung"
                    : ["unpaid", "paused", "incomplete"].includes(
                          sub.payment_status,
                        )
                      ? "Keine aktive Zahlungsfreigabe"
                      : sub.payment_status === "past_due"
                        ? "Zahlung ausstehend"
                        : sub.paid_through
                          ? `Bezahlt bis ${formatBerlin(sub.paid_through)}`
                          : "Noch keine bestätigte Zahlung"}
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
                      : ""}
                    {freeExit
                      ? "Erste Zahlung entfällt wegen rechtzeitiger Kündigung während der Gratisphase."
                      : sub.first_payment_at
                        ? `${sub.activated_at ? "Bei Fortsetzung: " : ""}${formatBerlin(sub.first_payment_at)}`
                        : "Erster Zahlungstermin noch nicht bestätigt"}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-slate-500">Kündigung</dt>
                <dd>
                  {sub.cancellation_at
                    ? `Vereinbart zum ${formatBerlin(sub.cancellation_at)}${data.billing_recovery?.pending ? " · Bestätigung des Zahlungsdienstleisters ausstehend" : ""}`
                    : sub.cancel_at_period_end
                      ? `Zum ${formatBerlin(sub.period_end)}`
                      : "Keine Kündigung zum Periodenende"}
                </dd>
              </div>
            </>
          )}
        </dl>
        <p className="text-sm">
          <a
            className="underline"
            href={`/partner/seo?partner=${rights.partner_id}`}
          >
            SEO Monitor und Quellenstatus
          </a>
        </p>
        {(data.addons || []).map((addon) => (
          <p key={addon.offer_code} className="mt-3 text-sm">
            {addon.offer_code === "commerce"
              ? "Bestellungen & Termine"
              : "SEO Monitor"}
            : Vertrag {addon.state === "active" ? "gekauft" : "inaktiv"} ·
            Nutzung{" "}
            {rights.features[
              addon.offer_code === "commerce" ? "commerce" : "seo.monitor"
            ]
              ? "aktiv"
              : `gesperrt (${reasons[rights.reason_codes[addon.offer_code === "commerce" ? "commerce" : "seo.monitor"]] ?? "Einrichtung oder Freigabe ausstehend"})`}{" "}
            · {addon.cancel_at_period_end ? "gekündigt zum" : "Zeitraum bis"}{" "}
            {formatBerlin(addon.valid_until)}
          </p>
        ))}
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
                    rights.features[key] ? "text-emerald-700" : "text-slate-500"
                  }
                >
                  {rights.features[key]
                    ? "Freigeschaltet"
                    : "Nicht freigeschaltet"}
                </strong>
                <small className="block text-slate-500">
                  {reasons[rights.reason_codes[key]] ??
                    "Tarifabhängige Freigabe"}
                </small>
                {data.feature_exceptions
                  ?.filter((e) => e.feature_key === key)
                  .map((e) => (
                    <small key={e.source} className="block text-slate-500">
                      {e.source === "admin"
                        ? "Admin-Ausnahme"
                        : "Bestehende Freigabe"}{" "}
                      · {e.effect === "deny" ? "Sperre" : "Erlaubnis"} bis{" "}
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
                {key === 'deal_drops_monthly' && rights.limits[key] === null ? 'Ohne Monatslimit (vorläufig)' : rights.limits[key] ?? '—'}
              </dd>
            </div>
          ))}
        </dl>
        {data.usage.length ? (
          data.usage.map((u) => (
            <p key={u.period_start} className="mt-4 text-sm">
              KI-Importe: {u.used} belegt, davon {u.reserved} in Bearbeitung ·{" "}
              {formatBerlin(u.period_start)} – {formatBerlin(u.period_end)}
            </p>
          ))
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Keine KI-Importe im laufenden Kontingentzeitraum belegt.
          </p>
        )}
      </section>
      <section>
        <h3 className="text-xl font-bold">Tarife im Vergleich</h3>
        <p className="mt-2 text-sm text-slate-500">
          Veröffentlichte Preisangebote · zzgl. MwSt. Buchung setzt eine
          gesonderte Abrechnungsfreigabe voraus. Bestehende Verträge bleiben
          unverändert.
        </p>
        <div className="mt-5 grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className={box}>
            <p className="text-sm font-semibold text-slate-500">
              Für deinen Start
            </p>
            <h4 className="mt-2 text-xl font-bold">Free</h4>
            <p className="mt-4 text-3xl font-bold">0 €</p>
            <p className="mt-1 text-sm text-slate-500">kostenlos</p>
            <ul className="mt-5 space-y-2 text-sm">
              <li>Standardprofil auf der Stadtseite</li>
              <li>30 Tage Auswertung</li>
              <li>Normale Angebote und Happy Hour unbegrenzt · 1 Deal Drop je Kalendermonat · 3 Teammitglieder</li>
              <li>Keine eigene Microsite</li>
            </ul>
          </article>
          {data.catalog.offers
            .filter((o) =>
              ["standard", "founder", "founder_annual"].includes(o.offer_code),
            )
            .map((o) => (
              <article
                key={`${o.offer_code}-${o.version}`}
                className={`${box} ${o.offer_code.startsWith("founder") ? "border-amber-200 bg-amber-50/30" : ""}`}
              >
                <p
                  className={`text-sm font-semibold ${o.offer_code.startsWith("founder") ? "text-amber-800" : "text-sky-700"}`}
                >
                  {o.offer_code.startsWith("founder")
                    ? "Für berechtigte Gründungspartner"
                    : "Mehr Möglichkeiten"}
                </p>
                <h4 className="mt-2 text-xl font-bold">
                  {o.offer_code.startsWith("founder")
                    ? "Pro Founder"
                    : "Pro Standard"}
                </h4>
                <p className="mt-4 text-3xl font-bold">{priceLabel(o)}</p>
                <p className="mt-1 text-sm text-slate-500">
                  / {o.billing_interval === "year" ? "Jahr im Voraus" : "Monat"}{" "}
                  · zzgl. MwSt.
                </p>
                {o.setup_amount > 0 && (
                  <p className="mt-2 text-sm">
                    {new Intl.NumberFormat("de-DE", {
                      style: "currency",
                      currency: o.currency,
                    }).format(o.setup_amount / 100)}{" "}
                    Einrichtung
                  </p>
                )}
                <ul className="mt-5 space-y-2 text-sm">
                  <li>Eigene Microsite</li>
                  <li>365 Tage Auswertung</li>
                  <li>Normale Angebote und Happy Hour unbegrenzt · Deal Drops vorläufig ohne Monatslimit · 10 Teammitglieder</li>
                  <li>2 KI-Importe / Monat, nur nach Freigabe</li>
                </ul>
                {o.offer_code.startsWith("founder") && (
                  <p className="mt-5 border-t border-amber-200 pt-4 text-sm leading-6">
                    6 Monate gratis ab tatsächlicher Aktivierung, währenddessen
                    monatlicher Ausstieg. Bei Fortsetzung folgen 12 bezahlte
                    Monate.
                  </p>
                )}
                <details className="mt-4 text-xs text-slate-500">
                  <summary className="cursor-pointer">Angebotsdetails</summary>
                  <p className="mt-2">
                    Preisversion {o.version} · Tarifversion {o.plan_version}
                  </p>
                </details>
              </article>
            ))}
        </div>
      </section>
      {data.catalog.offers.some((o) =>
        ["commerce", "seo"].includes(o.offer_code),
      ) && (
        <section>
          <h3 className="text-xl font-bold">Zusatzmodule</h3>
          <p className="mt-2 text-sm text-slate-500">
            Verfügbarkeit und Nutzung hängen von Tarif, Einrichtung und
            Betriebsfreigabe ab.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {data.catalog.offers
              .filter((o) => ["commerce", "seo"].includes(o.offer_code))
              .map((o) => (
                <article className={box} key={`${o.offer_code}-${o.version}`}>
                  <h4 className="text-lg font-bold">
                    {o.offer_code === "commerce"
                      ? "Bestellungen & Termine"
                      : "SEO Monitor"}
                  </h4>
                  <p className="mt-3 text-2xl font-bold">
                    {priceLabel(o)}{" "}
                    <small className="text-sm font-normal text-slate-500">
                      /{" "}
                      {o.billing_interval === "year"
                        ? "Jahr im Voraus"
                        : "Monat"}{" "}
                      zzgl. MwSt.
                    </small>
                  </p>
                  {o.setup_amount > 0 && (
                    <p className="mt-2 text-sm">
                      {new Intl.NumberFormat("de-DE", {
                        style: "currency",
                        currency: o.currency,
                      }).format(o.setup_amount / 100)}{" "}
                      Einrichtung
                    </p>
                  )}
                  <p className="mt-3 text-sm text-slate-500">
                    {rights.features[
                      o.offer_code === "commerce" ? "commerce" : "seo.monitor"
                    ]
                      ? "Nutzung freigeschaltet"
                      : "Derzeit nicht freigeschaltet"}
                  </p>
                  <details className="mt-3 text-xs text-slate-500">
                    <summary>Angebotsdetails</summary>Version {o.version}
                  </details>
                </article>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
function Field({
  label,
  name,
  type = "text",
  value,
  min,
  step,
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string | number;
  min?: number;
  step?: string;
  required?: boolean;
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
        required={required}
      />
    </label>
  );
}
function ChangeForm({
  operation,
  partnerId,
  children,
  label = "Speichern",
  reasonLabel = "Grund der Änderung",
  onSaved,
}: {
  operation: string;
  partnerId: string;
  children: React.ReactNode;
  label?: string;
  reasonLabel?: string;
  onSaved: () => void;
}) {
  const [state, action, pending] = useActionState(updatePartnerPlan, {
    ok: false,
    message: "",
  });
  useEffect(() => {
    if (state.ok) onSaved();
  }, [state, onSaved]);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="partner_id" value={partnerId} />
      {children}
      <Field label={reasonLabel} name="reason" />
      <p
        role="status"
        className={
          state.ok ? "text-sm text-emerald-800" : "text-sm text-rose-700"
        }
      >
        {state.message}
      </p>
      <button className={button} disabled={pending}>
        {pending ? "Wird gespeichert …" : label}
      </button>
    </form>
  );
}
export function PartnerPlanPanel({
  partnerId,
  initialData,
}: {
  partnerId: string;
  initialData?: PlanPanel;
}) {
  const [data, setData] = useState<PlanPanel | undefined>(initialData),
    [error, setError] = useState(""),
    [generation, setGeneration] = useState(0);
  const [mode, setMode] = useState("standard");
  const [preview, setPreview] = useState<Dashboard | null>(null),
    [previewError, setPreviewError] = useState(""),
    [previewPending, setPreviewPending] = useState(false);
  // Identity-bound loading prevents a previous partner's panel from flashing after selection changes.
  useEffect(() => {
    if (initialData) return;
    let alive = true;
    loadPartnerPlanPanel(partnerId)
      .then((value) => {
        if (alive) {
          setData(value);
          setError("");
        }
      })
      .catch(() => {
        if (alive)
          setError(
            "Tarifdaten konnten nicht geladen werden. Bitte erneut versuchen.",
          );
      });
    return () => {
      alive = false;
    };
  }, [partnerId, generation, initialData]);
  const reload = useCallback(() => setGeneration((n) => n + 1), []);
  if (!data || data.entitlements.partner_id !== partnerId)
    return (
      <div className={box}>
        <p role="status">{error || "Tarifdaten werden geladen …"}</p>
        {error && (
          <button className={button} onClick={reload}>
            Erneut versuchen
          </button>
        )}
      </div>
    );
  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-sky-50 p-4 text-sm text-sky-950">
        Sichere Admin-Vorschau der wirksamen Partnerrechte. Du bleibst im
        Admin-Bereich; Partner-Sitzungen werden nicht übernommen.
      </div>
      {!!data.billing_cases?.length && (
        <details className={box}>
          <summary>Referenzen für die Admin-Abrechnungsprüfung</summary>
          <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs">
            {JSON.stringify(data.billing_cases, null, 2)}
          </pre>
        </details>
      )}
      {data.founder_activation_review?.required && (
        <section className={box}>
          <h3 className="font-bold">Verspätetes Founder-Providerobjekt</h3>
          <p>
            Im Stripe-Dashboard den zum geschlossenen Vertrag gehörenden
            Schedule und dessen Subscription anhand des Audit-Eintrags prüfen
            und ohne weitere Abrechnung beenden. Entstandene Rechnungen /
            Zahlungen gesondert prüfen und gemäß Vereinbarung korrigieren; keine
            automatische Erstattung. Erst dann den belegten Abschluss
            protokollieren. Der Server prüft, dass kein zugehöriger Schedule
            oder Subscription weiterläuft.
          </p>
          <ChangeForm
            operation="closed_founder_review"
            partnerId={partnerId}
            onSaved={reload}
            reasonLabel="Providerobjekte, Kündigungsnachweis und Rechnungs-/Korrekturergebnis"
            label="Geprüften Provider-Abschluss protokollieren"
          >
            {null}
          </ChangeForm>
        </section>
      )}
      {data.pending_founder?.recovery_required && (
        <section className={box}>
          <h3 className="font-bold">Unbestätigte Founder-Aktivierung prüfen</h3>
          <p>
            Den ursprünglichen Schedule-Erstellungsrequest im Stripe-Dashboard
            prüfen. Nur bei nachgewiesenem endgültigem Fehlschlag ohne
            erstelltes Abo darf dieser Intent geschlossen werden. Ein Timeout
            oder abgelaufener Termin allein reicht nicht. Der Server prüft
            Schedule und Subscription erneut; vorhandene Objekte müssen
            abgeglichen werden.
          </p>
          <ChangeForm
            operation="failed_founder_activation"
            partnerId={partnerId}
            onSaved={reload}
            reasonLabel="Endgültiges Provider-Ergebnis und Prüfbeleg (mindestens 30 Zeichen)"
            label="Nie aktivierten Intent nach Prüfung schließen"
          >
            <label>
              Stripe-Request-Referenz
              <input
                className={input}
                name="request_id"
                required
                pattern="req_[A-Za-z0-9]+"
              />
            </label>
            <label>
              <input
                type="checkbox"
                name="terminal_failure"
                value="confirmed"
                required
              />{" "}
              Endgültiger Provider-Fehlschlag belegt, kein noch laufender
              Request.
            </label>
          </ChangeForm>
        </section>
      )}
      {data.founder_cancellation?.billing_review_required && (
        <section className={box}>
          <h3 className="font-bold">Founder-Abrechnungsprüfung</h3>
          <p>
            Rechtzeitig eingegangene Kündigung mit verspäteter
            Provider-Abwicklung. Im Stripe-Dashboard die zum Vertrag gehörende
            Subscription und erste Rechnung / Zahlung prüfen. Offene
            unberechtigte Rechnung nach Prüfung stornieren; bereits bezahlte
            Beträge gemäß geprüfter Kundenvereinbarung korrigieren. Hier erst
            nach belegter Korrektur oder bestätigtem fehlendem Zahlungsbedarf
            abschließen. Keine automatische Erstattung.
          </p>
          <ChangeForm
            operation="billing_review"
            partnerId={partnerId}
            onSaved={reload}
            reasonLabel="Rechnungs-/Zahlungsreferenz, geprüftes Ergebnis und Korrekturbeleg"
            label="Abrechnungsprüfung protokollieren"
          >
            {null}
          </ChangeForm>
        </section>
      )}
      <PartnerPlanSummary data={data} />
      <section className={box}>
        <h3 className="mb-3 text-lg font-bold">
          Founder-Zulassung · Annweiler
        </h3>
        <p className="mb-3 text-sm text-slate-600">
          Prüfe die tatsächliche Verbindung zur Kampagnenstadt. Profiladresse
          oder Stadtangabe des Inhabers allein reichen nicht. Die Entscheidung
          reserviert noch keinen Platz und schließt keinen Vertrag ab.
        </p>
        {data.founder?.campaign_city_id ? (
          <>
            <p className="mb-3 text-sm">
              Kampagnenstadt: {data.founder.campaign_city_name}. Aktuelle
              Entscheidung:{" "}
              {data.founder.eligible ? "berechtigt" : "nicht bestätigt"}.
              {data.founder.admitted
                ? " Ein Founder-Vertrag wurde bereits angenommen; kein erneuter Testzeitraum."
                : ""}
            </p>
            {data.founder.evidence && (
              <p className="mb-3 text-sm">
                Letzter Nachweis: {data.founder.evidence}
                {data.founder.decided_at
                  ? ` · ${formatBerlin(data.founder.decided_at)}`
                  : ""}
              </p>
            )}
            <ChangeForm
              operation="founder_eligibility"
              partnerId={partnerId}
              onSaved={reload}
              reasonLabel="Geprüfter Annweiler-Nachweis und Entscheidungsgrund"
              label="Founder-Entscheidung speichern"
            >
              <input
                type="hidden"
                name="city_id"
                value={data.founder.campaign_city_id}
              />
              <label className="block text-sm font-medium">
                Entscheidung
                <select
                  name="eligible"
                  className={input}
                  defaultValue={data.founder.eligible ? "true" : "false"}
                >
                  <option value="false">
                    Nicht berechtigt / Bestätigung widerrufen
                  </option>
                  <option value="true">
                    Annweiler-Zugehörigkeit geprüft und bestätigt
                  </option>
                </select>
              </label>
            </ChangeForm>
          </>
        ) : (
          <p role="status" className="text-sm text-amber-800">
            Die verifizierte Kampagnenstadt ist noch nicht eingerichtet. Die
            Founder-Zulassung bleibt gesperrt; Vertrags- und Zahlungsfreigabe
            sind zusätzlich erforderlich.
          </p>
        )}
      </section>
      <section className={box}>
        <h3 className="mb-3 text-lg font-bold">
          Partneransicht · letzte 7 Tage
        </h3>
        <button
          type="button"
          disabled={previewPending}
          className={button}
          onClick={async () => {
            setPreviewPending(true);
            setPreviewError("");
            try {
              setPreview(await loadPartnerDashboardPreview(partnerId));
            } catch {
              setPreview(null);
              setPreviewError(
                "Die Partnerstatistik ist aktuell nicht verfügbar oder gesperrt.",
              );
            } finally {
              setPreviewPending(false);
            }
          }}
        >
          {previewPending
            ? "Vorschau wird geladen …"
            : "Sichere Statistikvorschau laden"}
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
          {mode !== "standard" && (
            <Field
              label="Ablaufdatum (00:00 Uhr Berlin)"
              name="valid_until"
              type="date"
            />
          )}
          {mode === "limit" && (
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
              :{" "}
              {o.effect === "deny"
                ? "Gesperrt"
                : o.effect === "limit"
                  ? o.limit_value
                  : "Erlaubt"}{" "}
              · {o.source === "admin" ? "Admin" : "Bestehende Freigabe"} · bis{" "}
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
              <option value="founder">Pro Founder (monatlich)</option>
              <option value="founder_annual">
                Pro Founder (jährlich im Voraus)
              </option>
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
              label="Preis in EUR je gewähltem Intervall, zzgl. MwSt."
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
              .filter(([key]) => !["commerce", "seo.monitor"].includes(key))
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
              <Field key={key} label={key === "deal_drops_monthly" ? `${label} (leer = vorläufig unbegrenzt bei Pro)` : label} name={key} type="number" min={0} required={key !== "deal_drops_monthly"} />
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
                {d.kind === "offer" ? "Preisangebot" : "Tarif"}{" "}
                {String(d.payload.offer_code ?? d.payload.plan_code)} · Version{" "}
                {String(d.payload.version)} ·{" "}
                {d.status === "draft"
                  ? "Entwurf"
                  : d.status === "published"
                    ? "Freigegeben"
                    : "Archiviert"}
              </h4>
              {d.kind === "offer" ? (
                <p className="my-3 text-sm">
                  {new Intl.NumberFormat("de-DE", {
                    style: "currency",
                    currency: "EUR",
                  }).format(Number(d.payload.unit_amount) / 100)}{" "}
                  {d.payload.offer_code === "founder_annual"
                    ? "jährlich im Voraus"
                    : "monatlich"}
                  , zzgl. MwSt. · Einrichtung{" "}
                  {Number(d.payload.setup_amount ?? 0) / 100} EUR · Tarifversion{" "}
                  {String(d.payload.plan_version ?? "Zusatzmodul")}
                </p>
              ) : (
                <ul className="my-3 grid gap-1 text-sm sm:grid-cols-2">
                  {Object.entries(
                    (d.payload.features ?? {}) as Record<string, boolean>,
                  ).map(([key, value]) => (
                    <li key={key}>
                      {featureLabels[key]}: {value ? "Ja" : "Nein"}
                    </li>
                  ))}
                  {Object.entries(
                    (d.payload.limits ?? {}) as Record<string, number | null>,
                  ).map(([key, value]) => (
                    <li key={key}>
                      {limitLabels[key] ?? "Historischer Grenzwert"}: {value === null ? "Ohne Monatslimit (vorläufig)" : value}
                    </li>
                  ))}
                </ul>
              )}
              {d.status === "draft" && (
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
              {[
                "standard",
                "founder",
                "founder_annual",
                "commerce",
                "seo",
                "pro",
              ].map((c) => (
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
              <time>{formatBerlin(a.created_at)}</time> ·{" "}
              {a.source === "admin" ? "Benefitsi Admin" : "Bestehende Freigabe"}
              <p>{a.reason}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
