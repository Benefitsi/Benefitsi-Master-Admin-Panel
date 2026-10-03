'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { Users, RotateCcw, Gift, BookOpen, Mic, ArrowUpRight, FilePenLine } from 'lucide-react';
import { savePartnerCrm, requestPartnerEditorial, loadPartnerCrm, previewPartnerCrmAudience } from '@/app/partner/crm-actions';
import { defaultConfig, crmError, parseCrmAudiencePreview, crmKinds, editorialKeys, type CrmAudiencePreview, type CrmRead, type CrmDeals, type CrmKind, type CrmAudience, type CrmCampaign, type CampaignInput, type EditorialRequest, type EditorialKey } from '@/lib/partners/crm';
export const crmAudienceLabels: Record<CrmKind, string> = {
  second_visit: 'Zweiter Besuch',
  comeback: 'Comeback',
  reward_reminder: 'Belohnung in Reichweite'
};
export const editorialLabels: Record<EditorialKey, string> = {
  blog_article: 'Eigener Blogartikel',
  founder_interview: 'Gründer-/Inhaberinterview'
};
export const editorialStatusLabels = {
  not_requested: 'Nicht angefragt',
  requested: 'Angefragt',
  planned: 'Geplant',
  completed: 'Abgeschlossen'
};
const box = 'rounded-2xl border border-slate-200 bg-white p-5 sm:p-6';
const field = 'mt-2 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-2 focus:outline-[#0874d1] disabled:bg-slate-50';
const button = 'min-h-11 rounded-xl bg-[#0874d1] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#065da9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50';
const secondary = 'min-h-11 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-[#0874d1] hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-50';
export function audienceValue(a: CrmAudience) {
  return a.status === 'ok' ? new Intl.NumberFormat('de-DE').format(a.value as number) : a.status === 'empty' ? '0' : a.status === 'suppressed' ? 'Aus Datenschutzgründen verborgen' : 'Noch nicht ermittelbar';
}
function newDraft(kind: CrmKind): CampaignInput {
  return {
    id: crypto.randomUUID(),
    expected_revision: 0,
    kind,
    title: '',
    body: '',
    deal_id: null,
    config: defaultConfig(kind),
    channel: 'in_app',
    status: 'draft'
  };
}
function editDraft(c: CrmCampaign): CampaignInput {
  const {
    revision,
    partner_id: _,
    created_at: __,
    updated_at: ___,
    ...input
  } = c;
  return {
    ...input,
    expected_revision: revision
  };
}
const date = (v: string) => new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
}).format(new Date(v));
export function PartnerCrmWorkspace({
  partnerId,
  actorId,
  initial,
  deals,
  onAccessLost
}: {
  partnerId: string;
  actorId: string;
  initial: CrmRead;
  deals: CrmDeals;
  onAccessLost?: () => void;
}) {
  if (initial.status !== 'ready') return <section className="rounded-3xl bg-[#061829] p-6 text-white sm:p-8">
    <p className="text-sm font-bold text-[#17d4d7]">Kundenbindung mit Pro</p>
    <h2 className="mt-2 text-2xl font-bold">Den nächsten Besuch vorbereiten</h2>
    <p className="mt-3 max-w-2xl leading-7 text-slate-200">Zweiten Besuch, Comeback und eine Belohnung in Reichweite prüfen, Nachrichten als Entwurf speichern und redaktionelle Beiträge anfragen.</p>
    <p role={initial.status === 'unavailable' ? 'alert' : 'status'} className="mt-4 text-sm text-slate-300">
      {initial.status === 'unavailable' ? 'Kundenbindung ist aktuell noch nicht verfügbar. Bitte später erneut versuchen.' : initial.message}
    </p>
    <p className="mt-3 text-sm text-slate-300">Nachrichtenversand wird vorbereitet. Es werden keine Nachrichten versendet.</p>
    <a href={`/partner/billing?partner=${encodeURIComponent(partnerId)}`} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 py-2 font-bold text-[#061829]">Tarif & Leistungen ansehen <ArrowUpRight size={18} />
    </a>
  </section>;
  return <ReadyCrmWorkspace key={`${partnerId}:${actorId}`} partnerId={partnerId} actorId={actorId} initial={initial} deals={deals} onAccessLost={onAccessLost} />;
}
function ReadyCrmWorkspace({
  partnerId,
  actorId,
  initial,
  deals,
  onAccessLost
}: {
  partnerId: string;
  actorId: string;
  initial: Extract<CrmRead, {
    status: 'ready';
  }>;
  deals: CrmDeals;
  onAccessLost?: () => void;
}) {
  const [campaigns, setCampaigns] = useState(initial.dashboard.campaigns),
    [campaignSource, setCampaignSource] = useState(initial.dashboard.campaigns),
    [editor, setEditor] = useState<CampaignInput>(() => newDraft('second_visit')),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [conflict, setConflict] = useState(false),
    [pending, startTransition] = useTransition();
  const live = useRef(true),
    editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  if (campaignSource !== initial.dashboard.campaigns) {
    setCampaignSource(initial.dashboard.campaigns);
    setCampaigns(initial.dashboard.campaigns);
  }
  const dashboard = initial.dashboard;
  function choose(input: CampaignInput) {
    setEditor(input);
    setError('');
    setMessage('');
    setConflict(false);
    editorRef.current?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'start'
    });
    editorRef.current?.querySelector<HTMLInputElement>('[name="title"]')?.focus();
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!initial.writable) return;
    const form = new FormData(event.currentTarget),
      status = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-status') ?? editor.status;
    const input: CampaignInput = {
      ...editor,
      title: String(form.get('title') ?? ''),
      body: String(form.get('body') ?? ''),
      channel: String(form.get('channel')) as CampaignInput['channel'],
      deal_id: String(form.get('deal_id') ?? '') || null,
      status: status as CampaignInput['status']
    };
    // Disabled unavailable selectors are omitted from FormData; preserve an existing link until the partner explicitly removes it.
    if (deals.status === 'unavailable') input.deal_id = editor.deal_id;
    setError('');
    setMessage('');
    setConflict(false);
    startTransition(async () => {
      try {
        const result = await savePartnerCrm(partnerId, input);
        if (!live.current) return;
        if (!result.ok) {
          setError(result.message);
          setConflict(result.code === 'conflict');
          if (result.code === 'denied') onAccessLost?.();
          return;
        }
        setCampaigns(previous => [result.value, ...previous.filter(c => c.id !== result.value.id)]);
        setEditor(editDraft(result.value));
        setMessage(result.message);
      } catch {
        if (live.current) setError('Der Entwurf konnte nicht gespeichert werden. Bitte erneut versuchen.');
      }
    });
  }
  function reloadSaved() {
    startTransition(async () => {
      try {
        const result = await loadPartnerCrm(partnerId);
        if (!live.current) return;
        if (!result.ok) {
          setError(result.message);
          if (result.code === 'denied') onAccessLost?.();
          return;
        }
        if (result.value.initial.status !== 'ready') {
          onAccessLost?.();
          setError('Bitte deinen Zugriff aktualisieren.');
          return;
        }
        const saved = result.value.initial.dashboard.campaigns.find(c => c.id === editor.id);
        setCampaigns(result.value.initial.dashboard.campaigns);
        if (saved) {
          setEditor(editDraft(saved));
          setConflict(false);
          setError('');
          setMessage('Gespeicherte Version geladen. Bitte Änderungen abgleichen.');
        } else setError('Der gespeicherte Entwurf konnte nicht gefunden werden. Bitte die Übersicht neu laden.');
      } catch {
        if (live.current) setError('Gespeicherte Version konnte nicht geladen werden. Bitte erneut versuchen.');
      }
    });
  }
  const missingDeal = editor.deal_id && deals.status === 'ready' && !deals.deals.some(d => d.id === editor.deal_id);
  return <div className="space-y-6">
    <section className="rounded-3xl bg-[#061829] p-6 text-white sm:p-8">
      <p className="text-sm font-bold text-[#17d4d7]">Besuche verbinden</p>
      <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Aus einem Besuch kann mehr werden</h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">Prüfe potenzielle Besuchsgruppen und bereite deinen nächsten Impuls vor. Nachrichtenversand wird vorbereitet. Du kannst Zielgruppen prüfen und Entwürfe speichern.</p>
      <p className="mt-4 text-xs leading-6 text-slate-300">365 abgeschlossene Berliner Kalendertage: {date(dashboard.window.from)} bis {date(dashboard.window.to)} (Ende nicht eingeschlossen). Stand {date(dashboard.as_of)}. Potenzielle Gruppen sind keine erreichbaren oder eingewilligten Marketingempfänger und können sich überschneiden.</p>
    </section>
    <div className="grid gap-4 md:grid-cols-3">
      {crmKinds.map(kind => {
        const a = dashboard.audiences[kind],
          Icon = kind === 'second_visit' ? Users : kind === 'comeback' ? RotateCcw : Gift;
        return <article key={kind} data-audience={kind} className={`${box} flex flex-col border-t-4 ${kind === 'second_visit' ? 'border-t-sky-500' : kind === 'comeback' ? 'border-t-amber-400' : 'border-t-teal-400'}`}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-bold">
              {crmAudienceLabels[kind]}
            </h3>
            <Icon size={24} className={kind === 'comeback' ? 'text-amber-600' : kind === 'reward_reminder' ? 'text-teal-600' : 'text-[#0874d1]'} aria-hidden="true" />
          </div>
          <p className={`mt-5 font-bold ${a.status === 'ok' || a.status === 'empty' ? 'text-4xl' : 'text-lg'}`}>
            {audienceValue(a)}
          </p>
          <p className="mt-2 text-xs text-slate-500">Potenzielle Besuchsgruppe</p>
          <p className="mt-4 flex-1 text-sm leading-6 text-slate-600">
            {kind === 'second_visit' ? 'Genau ein bestätigter Besuch im Zeitfenster. Das ist keine Aussage über den ersten Besuch im gesamten Leben.' : kind === 'comeback' ? 'Letzter bestätigter Besuch im Zeitfenster liegt mindestens 45 Berliner Tage zurück.' : 'Ein oder zwei Stempel bis zur nächsten tatsächlich berechtigten Basisbelohnung; aktueller Kartenstand.'}
          </p>
          {a.status === 'empty' && <p className="mt-3 text-sm text-slate-500">Aktuell keine Gäste in dieser Gruppe. Du kannst trotzdem einen Entwurf vorbereiten.</p>}
          {a.status === 'suppressed' && <p className="mt-3 text-sm text-slate-500">Kleine Gruppen werden zum Schutz der Gäste nicht beziffert.</p>}
          {a.status === 'unavailable' && <p className="mt-3 text-sm text-slate-500">Die benötigten Karten- oder Regeldaten sind noch nicht vollständig verfügbar.</p>}
          <button type="button" disabled={!initial.writable || pending} onClick={() => choose(newDraft(kind))} className={`${secondary} mt-5`}>Entwurf vorbereiten</button>
        </article>;
      })}
    </div>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section className={box} ref={editorRef} aria-labelledby="crm-editor">
        <div className="flex items-center gap-3">
          <FilePenLine size={23} className="text-[#0874d1]" aria-hidden="true" />
          <h2 id="crm-editor" className="text-xl font-bold">Dein Kampagnenentwurf</h2>
        </div>
        <p className="mt-3 rounded-xl bg-sky-50 p-4 text-sm leading-6 text-sky-900">Ausschließlich Entwürfe: Speichern löst keinen Versand und keine Terminplanung aus. Es gibt noch keine Kampagnenergebnisse.</p>
        {!initial.writable && <p role="status" className="mt-4 text-sm text-slate-600">Du kannst die Übersicht lesen und Zielgruppen prüfen. Für das Speichern fehlen die Marketing-Verwaltungsrechte.</p>}
        <form key={`${editor.id}:${editor.expected_revision}`} data-campaign-form onSubmit={submit} className="mt-5 space-y-4">
          <fieldset disabled={pending} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">Ziel<select name="kind" className={field} value={editor.kind} onChange={e => setEditor(previous => ({
                ...previous,
                kind: e.target.value as CrmKind,
                config: defaultConfig(e.target.value as CrmKind)
              }))}>
                {crmKinds.map(kind => <option key={kind} value={kind}>
                  {crmAudienceLabels[kind]}
                </option>)}
              </select>
              </label>
              {initial.writable && <label className="block text-sm font-semibold">Vorgesehener Kanal<select name="channel" className={field} defaultValue={editor.channel}>
                <option value="in_app">In-App</option>
                <option value="push_and_in_app">Push und In-App</option>
              </select>
              </label>}
            </div>
            {editor.kind === 'comeback' && <label className="block text-sm font-semibold">Inaktivität in Tagen<select name="inactivity_days" className={field} value={editor.config.inactivity_days} onChange={e => setEditor(previous => ({
              ...previous,
              config: {
                inactivity_days: Number(e.target.value)
              }
            }))}>
              {[30, 45, 60, 90, ...(![30, 45, 60, 90].includes(editor.config.inactivity_days) ? [editor.config.inactivity_days] : [])].map(value => <option key={value} value={value}>
                {value} Tage</option>)}
            </select>
            </label>}
            {editor.kind === 'reward_reminder' && <label className="block text-sm font-semibold">Fehlende Stempel<select name="remaining_stamps" className={field} value={editor.config.remaining_stamps} onChange={e => setEditor(previous => ({
              ...previous,
              config: {
                remaining_stamps: Number(e.target.value)
              }
            }))}>
              <option value="2">Ein oder zwei Stempel</option>
              <option value="1">Ein Stempel</option>
            </select>
            </label>}
            <CrmAudienceCheck key={JSON.stringify([actorId, partnerId, editor.id, editor.kind, editor.config])} actorId={actorId} partnerId={partnerId} draftId={editor.id} kind={editor.kind} config={editor.config} onAccessLost={onAccessLost} />
            {initial.writable && <>
              <label className="block text-sm font-semibold">Name des Entwurfs<input name="title" required maxLength={120} className={field} defaultValue={editor.title} placeholder="Zum Beispiel: Einladung zum Wiederbesuch" />
              </label>
              <label className="block text-sm font-semibold">Nachricht<textarea name="body" required maxLength={2000} rows={5} className={field} defaultValue={editor.body} placeholder="Welchen Anlass möchtest du deinen Gästen geben?" />
              </label>
              <label className="block text-sm font-semibold">Eigener aktiver Vorteil (optional)<select name="deal_id" disabled={deals.status === 'unavailable'} className={field} defaultValue={editor.deal_id ?? ''}>
                <option value="">Ohne Vorteilsverknüpfung</option>
                {deals.status === 'ready' && deals.deals.map(deal => <option key={deal.id} value={deal.id}>
                  {deal.title}
                </option>)}
                {(missingDeal || deals.status === 'unavailable' && editor.deal_id) && <option value={editor.deal_id!}>Gespeicherter Vorteil · Gültigkeit prüfen</option>}
              </select>
              </label>
              {deals.status === 'unavailable' && <p role="status" className="text-sm text-amber-800">
                {deals.message}
                {editor.deal_id && <> Die bestehende Verknüpfung bleibt erhalten. <button type="button" className="underline" onClick={() => setEditor(previous => ({
                  ...previous,
                  deal_id: null
                }))}>Verknüpfung entfernen</button>

            </>}
            </p>}
            {deals.status === 'ready' && !deals.deals.length && !missingDeal && <p className="text-sm text-slate-500">Keine aktiven Vorteile vorhanden. Ein Entwurf ist auch ohne Vorteil möglich.</p>}
            {missingDeal && <p role="alert" className="text-sm text-amber-800">Der gespeicherte Vorteil ist nicht mehr aktiv oder gültig. Bitte die Verknüpfung entfernen oder einen aktuellen Vorteil auswählen, bevor du speicherst, archivierst oder wiederherstellst.</p>}
            <div className="flex flex-wrap gap-3">
              <button type="submit" className={button}>
                {pending ? 'Wird gespeichert …' : editor.status === 'archived' ? 'Archivierten Entwurf speichern' : 'Entwurf speichern'}
              </button>
              {editor.expected_revision > 0 && <button type="submit" data-status={editor.status === 'archived' ? 'draft' : 'archived'} className={secondary}>
                {editor.status === 'archived' ? 'Wiederherstellen' : 'Archivieren'}
              </button>}
            </div>
            </>}
          </fieldset>
        </form>
        {error && <div role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          {error}
          {conflict && <button type="button" disabled={pending} onClick={reloadSaved} className={`${secondary} mt-3 block`}>Gespeicherte Version laden</button>}
        </div>}
        {message && <p role="status" className="mt-4 text-sm text-emerald-800">
          {message}
        </p>}
      </section>
      <section className={box}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Gespeicherte Entwürfe</h2>
          <button type="button" className={secondary} disabled={!initial.writable || pending} onClick={() => choose(newDraft('second_visit'))}>Neuer Entwurf</button>
        </div>
        {!campaigns.length ? <p className="mt-5 text-sm leading-6 text-slate-500">Noch kein Entwurf gespeichert. Wähle eine Besuchsgruppe und halte deine Idee fest.</p> : <ul className="mt-4 divide-y divide-slate-100">
          {campaigns.map(c => <li key={c.id} className="py-4">
            <p className="break-words font-semibold">
              {c.title}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {crmAudienceLabels[c.kind]} · {c.status === 'archived' ? 'Archiviert' : 'Entwurf'} · Version {c.revision}
            </p>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
              {c.body}
            </p>
            <button type="button" className={`${secondary} mt-3`} disabled={!initial.writable || pending} onClick={() => choose(editDraft(c))}>Bearbeiten</button>
          </li>)}
        </ul>}
      </section>
    </div>
    <section>
      <h2 className="text-xl font-bold">Deine Geschichte bei Benefitsi</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">Redaktionelle Leistungen mit Pro. Das Team bespricht Umfang und Termin mit dir. Eine Anfrage löst keine automatische Veröffentlichung oder Aufnahme aus.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {editorialKeys.map(key => <EditorialCard key={key} partnerId={partnerId} initial={dashboard.editorial_requests.find(r => r.service_key === key)!} onAccessLost={onAccessLost} />)}
      </div>
    </section>
  </div>;
}
function CrmAudienceCheck({ actorId, partnerId, draftId, kind, config, onAccessLost }: {
  actorId: string;
  partnerId: string;
  draftId: string;
  kind: CrmKind;
  config: Record<string, number>;
  onAccessLost?: () => void;
}) {
  // This instance is keyed by actor, partner, draft and canonical selection. A changed selection unmounts it immediately.
  const [scope] = useState(() => Object.freeze({ actorId, partnerId, draftId, kind, config: Object.freeze({ ...config }) }));
  const [state, setState] = useState<{ status: 'unchecked' | 'loading' | 'error'; message?: string } | { status: 'ready'; preview: CrmAudiencePreview }>({ status: 'unchecked' });
  const lifecycle = useRef({ live: true, generation: 0, inFlight: false });
  const [, startTransition] = useTransition();
  useEffect(() => {
    const current = lifecycle.current;
    current.live = true;
    return () => { current.live = false; ++current.generation; };
  }, []);
  function check() {
    const active = lifecycle.current;
    if (active.inFlight) return;
    const request = ++active.generation;
    active.inFlight = true;
    setState({ status: 'loading' });
    const current = () => active.live && active.generation === request;
    function fail(error: unknown) {
      if (!current()) return;
      const e = crmError(error);
      setState({ status: 'error', message: e.message });
      if (e.code === 'denied') onAccessLost?.();
    }
    startTransition(async () => {
      try {
        const result = await previewPartnerCrmAudience(scope.partnerId, scope.kind, scope.config);
        if (!current()) return;
        if (!result.ok) {
          setState({ status: 'error', message: result.message });
          if (result.code === 'denied' || result.code === '42501') onAccessLost?.();
          return;
        }
        if (result.value.actorId !== scope.actorId) {
          fail({ code: '42501' });
          return;
        }
        setState({ status: 'ready', preview: parseCrmAudiencePreview(result.value.preview, scope.partnerId, scope.kind, scope.config) });
      } catch (error) {
        fail(error);
      } finally {
        if (current()) active.inFlight = false;
      }
    });
  }
  const checkedAt = state.status === 'ready' ? new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(new Date(state.preview.as_of)) : '';
  return <aside data-recipient-preview className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6">
    <div role="status" aria-live="polite">
      {state.status === 'ready' ? <>
        <strong>Potenzielle Besuchsgruppe: {audienceValue(state.preview.audience)}</strong>
        <p className="mt-1">{scope.kind === 'comeback' ? `Letzter bestätigter Besuch im Zeitfenster liegt mindestens ${scope.config.inactivity_days} Berliner Tage zurück.` : scope.kind === 'reward_reminder' ? scope.config.remaining_stamps === 1 ? 'Ein Stempel bis zur nächsten tatsächlich berechtigten Basisbelohnung; aktueller Kartenstand.' : 'Ein oder zwei Stempel bis zur nächsten tatsächlich berechtigten Basisbelohnung; aktueller Kartenstand.' : 'Genau ein bestätigter Besuch im Zeitfenster.'}</p>
        <p className="mt-1 text-slate-500">Servergeprüft · Stand {checkedAt} (Europe/Berlin). 365 abgeschlossene Berliner Kalendertage: {date(state.preview.window.from)} bis {date(state.preview.window.to)} (Ende nicht eingeschlossen).</p>
      </> : <strong>{state.status === 'loading' ? 'Zielgruppe wird geprüft …' : 'Zielgruppe noch nicht geprüft'}</strong>}
    </div>
    {state.status === 'error' && <p role="alert" className="mt-2 text-amber-900">{state.message}</p>}
    <p className="mt-2 text-slate-500">Das ist keine Empfängerliste. Einwilligung und Erreichbarkeit sind noch nicht geprüft.</p>
    <button type="button" className={`${secondary} mt-3`} disabled={state.status === 'loading'} onClick={check}>Zielgruppe prüfen</button>
  </aside>;
}
function EditorialCard({
  partnerId,
  initial,
  onAccessLost
}: {
  partnerId: string;
  initial: EditorialRequest;
  onAccessLost?: () => void;
}) {
  const [saved, setSaved] = useState(initial),
    [savedSource, setSavedSource] = useState(initial),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [pending, startTransition] = useTransition(),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  if (savedSource !== initial) {
    setSavedSource(initial);
    setSaved(initial);
  }
  const Icon = saved.service_key === 'blog_article' ? BookOpen : Mic;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = String(new FormData(event.currentTarget).get('note') ?? '');
    setError('');
    startTransition(async () => {
      try {
        const result = await requestPartnerEditorial(partnerId, saved.service_key, note);
        if (!live.current) return;
        if (!result.ok) {
          setError(result.message);
          if (result.code === 'denied') onAccessLost?.();
          return;
        }
        setSaved(result.value);
        setMessage(result.message);
      } catch {
        if (live.current) setError('Die Anfrage konnte nicht gespeichert werden. Bitte erneut versuchen.');
      }
    });
  }
  return <article data-editorial={saved.service_key} className={box}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <Icon aria-hidden="true" className="text-[#0874d1]" size={23} />
        <h3 className="font-bold">
          {editorialLabels[saved.service_key]}
        </h3>
      </div>
      <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold">
        {editorialStatusLabels[saved.status]}
      </span>
    </div>
    <p className="mt-3 text-sm leading-6 text-slate-600">
      {saved.service_key === 'blog_article' ? 'Ein eigener Beitrag stellt deinen Betrieb und seine Besonderheiten vor.' : 'Ein Gespräch über deinen Betrieb und die Menschen dahinter, als Podcast oder Video.'}
    </p>
    {saved.status === 'not_requested' ? <form onSubmit={submit} className="mt-4">
      <label className="block text-sm font-semibold">Dein Briefing (optional)<textarea name="note" rows={3} maxLength={2000} disabled={pending} className={field} placeholder="Was möchtest du erzählen?" />
      </label>
      <button className={`${button} mt-4`} disabled={pending} type="submit">
        {pending ? 'Wird angefragt …' : 'Leistung anfragen'}
      </button>
    </form> : <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6">
      <p>Anfrage vom {date(saved.requested_at!)}
      </p>
      {saved.partner_note && <p className="mt-2 whitespace-pre-wrap break-words">
        {saved.partner_note}
      </p>}
      <p className="mt-2 text-slate-500">Deine Anfrage ist gespeichert. Umfang und Termin werden persönlich abgestimmt.</p>
    </div>}
    {error && <p role="alert" className="mt-3 text-sm text-amber-900">
      {error}
    </p>}
    {message && <p role="status" className="mt-3 text-sm text-emerald-800">
      {message}
    </p>}
  </article>;
}
