'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import type { FinanceStatus, FinanceRun } from '@/lib/finance-agent'
import { startFinanceCheck, refreshFinanceStatus } from './actions'

const dateTime = (value: string) => new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(new Date(value))
const sourceLabel = { available: 'Vorhanden', missing: 'Fehlt', not_connected: 'Nicht angebunden' }
const runLabel = { blocked: 'Unterlagen oder Einrichtung fehlen', needs_review: 'Vorbereitung erstellt · Prüfung offen', failed: 'Prüflauf fehlgeschlagen' }

export function FinanceWorkflow({ initial }: { initial: FinanceStatus | null }) {
  const [data, setData] = useState(initial)
  const [run, setRun] = useState<FinanceRun | null>(initial?.lastRun ?? null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState<{ task: 'setup' | 'review'; requestId: string } | null>(null)
  const [pending, startTransition] = useTransition()
  function start(task: 'setup' | 'review') {
    const requestId = retry?.task === task ? retry.requestId : crypto.randomUUID()
    setRetry({ task, requestId })
    setError(null)
    startTransition(async () => {
      const result = await startFinanceCheck(task, requestId)
      if (result.run) { setRun(result.run); setRetry(null) }
      else setError(result.error ?? 'Kein bestätigter Laufnachweis.')
    })
  }
  function refresh() {
    startTransition(async () => {
      const result = await refreshFinanceStatus()
      if (result.data) { setData(result.data); setRun(result.data.lastRun); setError(null) }
      else setError(result.error ?? 'Status nicht abrufbar.')
    })
  }
  return <div className="space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-teal-700">Benefitsi-Agent · Auf Abruf</p><h2 className="mt-2 text-2xl font-bold">Ein geordneter Start für deine Finanzen</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Der Agent prüft freigegebene Belege und Zahlungsnachweise, meldet mögliche Dubletten und bereitet eine Übergabe vor. Steuerliche Entscheidungen und verbindliche Erklärungen benötigen qualifizierte Prüfung.</p></div><Link href="/agents" className="text-sm font-semibold text-teal-700 hover:underline">Alle Agenten</Link></div>
      <p className="mt-4 text-sm font-semibold text-slate-700">{data ? `M1-Dienst erreichbar · beobachtet ${dateTime(data.observedAt)}` : 'Konfiguriert · M1-Dienst aktuell nicht bestätigt'}</p>
      <div className="mt-5 flex flex-wrap gap-3"><button onClick={() => start('setup')} disabled={pending || !data} className="rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50">{pending ? 'Prüfung läuft …' : 'Einrichtungscheck starten'}</button><button onClick={() => start('review')} disabled={pending || !data} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold hover:bg-slate-50 disabled:opacity-50">Belege prüfen</button><button onClick={refresh} disabled={pending} className="rounded-xl px-4 py-3 text-sm font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-50">Status aktualisieren</button></div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Ein Aufruf verarbeitet höchstens 20 Belege aus dem privat bereitgestellten Eingang. Jeder Aufruf erhält eine Lauf-ID. Originale und bestehende Berichte bleiben erhalten.</p>
      {error ? <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{error}</p> : null}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6" aria-live="polite">
      <h2 className="text-lg font-bold">Letzter belegter Arbeitslauf</h2>
      {run ? <><p className="mt-2 font-semibold text-amber-800">{runLabel[run.status]}</p><p className="mt-2 text-sm text-slate-600">{run.task === 'setup' ? 'Einrichtungscheck' : 'Belegprüfung'} · abgeschlossen {dateTime(run.finishedAt)}</p><p className="mt-1 break-all font-mono text-xs text-slate-500">Lauf-ID: {run.runId}</p><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Belege', run.counts.documents], ['Zahlungsnachweise', run.counts.payments], ['Prüfausnahmen', run.counts.issues], ['Mögliche Dubletten', run.counts.duplicateCandidates]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-4"><p className="text-xl font-bold">{value}</p><p className="mt-1 text-xs text-slate-600">{label}</p></div>)}</div><div className="mt-5 flex flex-wrap gap-4"><a href={`/agents/finance/export?runId=${run.runId}&format=json`} className="text-sm font-bold text-teal-700 hover:underline">Prüfbericht herunterladen (JSON)</a><a href={`/agents/finance/export?runId=${run.runId}&format=csv`} className="text-sm font-bold text-teal-700 hover:underline">Belegregister herunterladen (CSV)</a></div><p className="mt-3 text-xs text-slate-500">Arbeitsunterlagen zur Prüfung; kein endgültiger Buchungsexport. Originalbelege bleiben im privaten Eingang.</p></> : <p className="mt-3 text-sm text-slate-500">Ein tatsächlicher Arbeitslauf ist noch nicht nachgewiesen.</p>}
    </section>

    <div className="grid gap-6 lg:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold">Offene Aufgaben</h2>{run ? <ul className="mt-4 space-y-3">{run.tasks.map(task => <li key={task.code} className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">{task.title}</li>)}</ul> : <p className="mt-3 text-sm text-slate-500">Einrichtungscheck starten, um die belegten Lücken zu erfassen.</p>}</section><section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold">Datenquellen und Anbindungen</h2><ul className="mt-4 space-y-3">{(run?.sources ?? data?.sources ?? []).map(source => <li key={source.id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-slate-50 p-4 text-sm"><span>{source.label}</span><span className="font-semibold text-slate-600">{sourceLabel[source.state]}</span></li>)}</ul><p className="mt-4 text-xs leading-5 text-slate-500">Vorlagen und historische Planungen belegen keine heutigen Rechnungen, Zahlungen oder Unternehmensdaten. Vorhandene Stripe-Verträge ersetzen keinen Zahlungsnachweis.</p></section></div>

    <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold">Belegte Fristen</h2>{run?.deadlines.length ? <ul className="mt-3 space-y-2">{run.deadlines.map(deadline => <li key={deadline.id} className="text-sm">{deadline.dueOn} · {deadline.title} · <a href={deadline.sourceUrl} target="_blank" rel="noreferrer" className="text-teal-700 underline">Amtliche Grundlage</a></li>)}</ul> : <p className="mt-3 text-sm leading-6 text-slate-600">Es sind noch keine individuellen Steuerfristen bestätigt. Rechtsform, Tätigkeitsbeginn, Erfassungsstand und fachliche Zuständigkeit müssen zuerst belegt sein.</p>}</section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold">Belege für den ersten Prüflauf bereitstellen</h2><p className="mt-3 text-sm leading-6 text-slate-600">Verwende den privaten Eingang des M1-Finanzprofils und erfasse die freigegebenen Originale mit Beleg-ID, Rechnungsdaten und Zahlungsreferenz im zugehörigen Manifest. Der vorhandene Finanzstarter hilft bei der Erfassung. Fehlende Beträge bleiben leer; echte Nullwerte dürfen ausdrücklich erfasst werden.</p><details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold text-teal-700">Technischer Übergabepfad</summary><p className="mt-3 break-all rounded-xl bg-slate-50 p-4 font-mono text-xs">M1: /Users/patrick/.hermes/profiles/benefitsi-finance/private/inbox/<br />Metadaten: private/manifest.json<br />Prüfläufe und Exporte: private/runs/</p></details></section>
    {data?.rules.length ? <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold">Amtliche Grundlagen</h2><ul className="mt-4 space-y-4">{data.rules.map(rule => <li key={rule.id} className="text-sm"><a href={rule.url} target="_blank" rel="noreferrer" className="font-semibold text-teal-700 underline">{rule.title}</a><p className="mt-1 text-slate-600">{rule.application} Geprüft: {rule.checkedOn}.</p></li>)}</ul></section> : null}
  </div>
}
