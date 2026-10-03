'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { updatePartnerEditorial } from '@/app/partner/crm-actions';
import { parseAdminEditorialRequests, type AdminEditorialRequest, type EditorialStatus } from '@/lib/partners/crm';
const labels = {
  blog_article: 'Eigener Blogartikel',
  founder_interview: 'Gründer-/Inhaberinterview als Podcast oder Video'
};
const statuses = {
  not_requested: 'Nicht angefragt',
  requested: 'Angefragt',
  planned: 'Geplant',
  completed: 'Abgeschlossen'
};
const input = 'mt-2 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-2 focus:outline-sky-500';
export function PartnerEditorialManagement({
  partnerId,
  initial
}: {
  partnerId: string;
  initial: unknown;
}) {
  let requests: AdminEditorialRequest[];
  try {
    requests = parseAdminEditorialRequests(initial);
  } catch {
    return <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-bold">Redaktionelle Leistungen</h3>
      <p role="status" className="mt-3 text-sm text-slate-500">Redaktionsdaten sind noch nicht verfügbar. Bitte Tarifdaten erneut laden.</p>
    </section>;
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <h3 className="text-lg font-bold">Redaktionelle Leistungen</h3>
    <p className="mt-2 text-sm leading-6 text-slate-500">Bereits angefragte Beiträge verwalten, auch nach einem Tarifwechsel. Status und interner Grund werden protokolliert. Der interne Grund wird dem Partner nicht angezeigt.</p>
    <div className="mt-4 grid gap-5 md:grid-cols-2">
      {requests.map(r => <EditorialAdminCard key={`${partnerId}:${r.service_key}`} partnerId={partnerId} initial={r} />)}
    </div>
  </section>;
}
function EditorialAdminCard({
  partnerId,
  initial
}: {
  partnerId: string;
  initial: AdminEditorialRequest;
}) {
  const [saved, setSaved] = useState(initial),
    [savedSource, setSavedSource] = useState(initial),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
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
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      status = String(form.get('status')) as EditorialStatus,
      note = String(form.get('note') ?? '');
    setError('');
    setMessage('');
    startTransition(async () => {
      try {
        const result = await updatePartnerEditorial(partnerId, saved.service_key, status, note);
        if (!live.current) return;
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setSaved(result.value);
        setMessage(result.message);
      } catch {
        if (live.current) setError('Redaktionsstatus konnte nicht gespeichert werden. Bitte Berechtigung prüfen und erneut versuchen.');
      }
    });
  }
  return <article data-admin-editorial={saved.service_key} className="min-w-0 rounded-xl border border-slate-200 p-4">
    <h4 className="font-bold">
      {labels[saved.service_key]}
    </h4>
    <p className="mt-2 text-sm font-semibold">Aktueller Status: {statuses[saved.status]}
    </p>
    {saved.partner_note && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm leading-6">Partnerbriefing: {saved.partner_note}
    </p>}
    {saved.requested_at && <p className="mt-2 text-xs text-slate-500">Angefragt: {new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin',
      dateStyle: 'medium'
    }).format(new Date(saved.requested_at))}
    </p>}
    {saved.status === 'not_requested' ? <p className="mt-3 text-sm text-slate-500">Noch keine Partneranfrage. Ein Status kann erst nach der Anfrage gepflegt werden.</p> : <form key={`${saved.updated_at}:${saved.status}:${saved.admin_note}`} onSubmit={submit} className="mt-4 space-y-3">
      <fieldset disabled={pending} className="space-y-3">
        <label className="block text-sm font-semibold">Neuer Status<select className={input} name="status" defaultValue={saved.status}>
          <option value="requested">Angefragt</option>
          <option value="planned">Geplant</option>
          <option value="completed">Abgeschlossen</option>
        </select>
        </label>
        <label className="block text-sm font-semibold">Interner Grund / Notiz<textarea required maxLength={2000} name="note" rows={3} className={input} defaultValue={saved.admin_note ?? ''} />
        </label>
        <button type="submit" className="min-h-11 rounded-xl bg-[#0874d1] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {pending ? 'Wird gespeichert …' : 'Redaktionsstatus speichern'}
        </button>
      </fieldset>
    </form>}
    {error && <p role="alert" className="mt-3 text-sm text-amber-900">
      {error}
    </p>}
    {message && <p role="status" className="mt-3 text-sm text-emerald-800">
      {message}
    </p>}
  </article>;
}
