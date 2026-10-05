'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Archive, ArrowLeft, ArrowSquareOut, Check, Copy, DownloadSimple, FloppyDisk, Plus, Star } from '@phosphor-icons/react'
import { DocumentSession } from '@/lib/workspace/save-queue'
import { newId, pageKinds, pageStatuses, pageFromTemplate, type WorkspacePage, type PageMeta, type PageVersion, type Content, type PageKind } from '@/lib/workspace/model'
import { onboardingContent } from '@/lib/workspace/templates'
import { exportMarkdown } from '@/lib/workspace/export'
import type { WorkspaceServices } from './services'
import { BlockEditor } from './block-editor'
import { QuestionEditor } from './question-editor'
import { ResourcesEditor, TasksEditor } from './resources-editor'
import { PartnerContext } from './partner-context'
import { Button, Field, inputClass } from './ui'

type Props={page:WorkspacePage;pages:PageMeta[];favorite:boolean;services:WorkspaceServices;onStored:(page:WorkspacePage)=>void;onReplace:(page:WorkspacePage)=>void;onFavorite:()=>void;onCreate:(kind:PageKind,parent?:PageMeta,source?:WorkspacePage)=>Promise<void>;onBack:()=>void;setGuard:(guard:()=>Promise<boolean>)=>void}
export function WorkspaceEditor({page:initial,pages,favorite,services,onStored,onReplace,onFavorite,onCreate,onBack,setGuard}:Props){
  const [session]=useState(()=>new DocumentSession(initial,services.saveWorkspacePage,onStored))
  const snapshot=useSyncExternalStore(session.subscribe,session.snapshot,session.snapshot),page=snapshot.page
  const [tab,setTab]=useState(initial.kind==='conversation'?'conversation':'notes'),[focus,setFocus]=useState(false),[versions,setVersions]=useState<PageVersion[]>([]),[versionPreview,setVersionPreview]=useState<PageVersion|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[moreVersions,setMoreVersions]=useState(true)
  useEffect(()=>{session.activate();setGuard(()=>session.flush());return()=>{setGuard(async()=>true);session.dispose()}},[session,setGuard])
  useEffect(()=>{
    const before=(e:BeforeUnloadEvent)=>{if(session.dirty()){e.preventDefault();e.returnValue=''}}
    const click=(e:MouseEvent)=>{const target=(e.target as Element)?.closest?.('a');if(!target||target.target==='_blank'||target.hasAttribute('download')||!session.dirty()||e.ctrlKey||e.metaKey||e.shiftKey)return;e.preventDefault();void session.flush().then(ok=>{if(ok)window.location.assign(target.href)})}
    window.addEventListener('beforeunload',before);document.addEventListener('click',click,true)
    return()=>{window.removeEventListener('beforeunload',before);document.removeEventListener('click',click,true)}
  },[session])
  const patch=(values:Partial<WorkspacePage>)=>session.edit({...session.snapshot().page,...values})
  const content=(values:Partial<Content>)=>patch({content:{...session.snapshot().page.content,...values}})
  const operation=async(fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');try{await fn()}catch{setError('Die Aktion ist fehlgeschlagen. Dein Entwurf bleibt erhalten.')}finally{setBusy(false)}}
  const exportPage=(format:'md'|'json',value=page)=>{const blob=new Blob([format==='md'?exportMarkdown(value):JSON.stringify(value,null,2)],{type:format==='md'?'text/markdown;charset=utf-8':'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${value.title.replace(/[^a-z0-9äöüß_-]+/gi,'-').slice(0,70)||'workspace'}.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  const loadVersions=async(offset=0)=>{const result=await services.loadWorkspaceVersions(page.id,offset);if(result.ok){setVersions(old=>offset?[...old,...result.value]:result.value);setMoreVersions(result.value.length===10)}else setError(result.error)}
  const loadTab=(value:string)=>{setTab(value);if(value==='history')void operation(()=>loadVersions())}
  const descendants=new Set([page.id]);for(let i=0;i<pages.length;i++){let changed=false;for(const p of pages)if(p.parent_id&&descendants.has(p.parent_id)&&!descendants.has(p.id)){descendants.add(p.id);changed=true}if(!changed)break}
  return <section aria-label="Seiteneditor" className={`${focus?'fixed inset-0 z-50 overflow-y-auto bg-[#f7f6f1] p-3 sm:p-6':'min-w-0'} `}>
    <div className={`${focus?'mx-auto max-w-[1400px]':''} min-w-0 rounded-2xl border border-[#061829]/10 bg-white`}>
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-t-2xl border-b border-[#061829]/10 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-6">
        <Button aria-label="Zur Seitenübersicht" onClick={()=>{setFocus(false);onBack()}}><ArrowLeft size={16}/></Button>
        <span className="mr-auto text-xs font-semibold text-[#697680]">{pageKinds[page.kind]} · {page.archived?'Archiviert':'Intern'}</span>
        <span role="status" aria-live="polite" className={`flex items-center gap-1.5 text-xs ${snapshot.state==='error'||snapshot.state==='conflict'?'text-red-700':'text-[#526170]'}`}>{snapshot.state==='saved'?<Check size={14}/>:null}{{saved:'Gespeichert',dirty:'Ungespeichert',saving:'Wird gespeichert …',error:'Nicht gespeichert',conflict:'Versionskonflikt'}[snapshot.state]}</span>
        <Button disabled={busy||snapshot.state==='saving'} onClick={()=>void session.flush()} aria-label="Jetzt speichern"><FloppyDisk size={16}/></Button>
        <Button aria-label={favorite?'Favorit entfernen':'Als Favorit markieren'} aria-pressed={favorite} onClick={onFavorite}><Star size={16} weight={favorite?'fill':'regular'}/></Button>
        <Button onClick={()=>setFocus(v=>!v)}>{focus?'Fokus beenden':'Fokus'}</Button>
      </header>
      {(snapshot.message||error)?<div role="alert" className="mx-4 mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p>{error||snapshot.message}</p>{snapshot.state==='error'?<Button className="mt-3" onClick={()=>void session.flush()}>Erneut speichern</Button>:null}
        {snapshot.server?<div className="mt-3 grid gap-3"><details><summary className="cursor-pointer font-semibold">Gespeicherte Fassung vergleichen (Version {snapshot.server.revision})</summary><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs">{exportMarkdown(snapshot.server)}</pre></details><div className="flex flex-wrap gap-2"><Button onClick={()=>{if(window.confirm('Serverfassung laden? Exportiere bei Bedarf zuerst deinen lokalen Entwurf.'))session.acceptServer()}}>Serverfassung laden</Button><Button onClick={()=>void operation(async()=>{const copy={...page,id:newId(),revision:0,title:`${page.title.slice(0,170)} (lokaler Entwurf)`,parent_id:null};const result=await services.saveWorkspacePage(copy);if(result.ok)onReplace(result.value);else setError(result.error)})}>Lokalen Entwurf als Kopie sichern</Button><Button onClick={()=>exportPage('json')}>Entwurf exportieren</Button></div></div>:null}
      </div>:null}
      <div className="p-4 sm:p-6 lg:p-8">
        <label className="block"><span className="sr-only">Seitentitel</span><input value={page.title} onChange={e=>patch({title:e.target.value})} maxLength={200} className="mb-5 w-full min-w-0 border-0 bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-zinc-300 sm:text-3xl" placeholder="Seitentitel"/></label>
        <details className="mb-5 text-xs"><summary className="cursor-pointer text-[#526170]">Eigenschaften · {pageStatuses[page.status]}{page.owner?` · ${page.owner}`:''}{page.tags.length?` · ${page.tags.join(', ')}`:''}</summary><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Status"><select className={inputClass} value={page.status} onChange={e=>patch({status:e.target.value as WorkspacePage['status']})}>{Object.entries(pageStatuses).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Verantwortlich"><input className={inputClass} value={page.owner} maxLength={200} onChange={e=>patch({owner:e.target.value})}/></Field>
          <Field label="Termin"><input className={inputClass} type="date" value={page.due_date??''} onChange={e=>patch({due_date:e.target.value||null})}/></Field>
          <Field label="Tags (mit Komma trennen)"><input className={inputClass} value={page.tags.join(',')} onChange={e=>patch({tags:e.target.value.split(',')})}/></Field>
          <Field label="Übergeordnete Seite"><select className={inputClass} value={page.parent_id??''} onChange={e=>patch({parent_id:e.target.value||null})}><option value="">Keine · oberste Ebene</option>{pages.filter(p=>!descendants.has(p.id)&&!p.archived).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
          <Field label="Seitentyp"><select className={inputClass} value={page.kind} onChange={e=>patch({kind:e.target.value as PageKind})}>{Object.entries(pageKinds).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
        </div></details>
        <div className="mb-6 flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void operation(async()=>{if(await session.flush())await onCreate('note',session.snapshot().page)})}><Plus size={14}/>Unterseite</Button>
          {(page.kind==='partner'||page.partner_id)?<Button disabled={busy} onClick={()=>void operation(async()=>{if(await session.flush())await onCreate('conversation',session.snapshot().page)})}>Gespräch starten</Button>:null}
          <details className="relative"><summary className="cursor-pointer rounded-lg border border-[#061829]/15 px-3 py-2.5 text-sm font-semibold">Weitere Aktionen</summary><div className="absolute left-0 top-full z-20 mt-1 grid w-64 gap-1 rounded-xl border border-[#061829]/15 bg-white p-2 shadow-lg">
            <Button onClick={()=>void operation(async()=>{if(await session.flush()){const result=await services.saveWorkspacePage({...session.snapshot().page,id:newId(),revision:0,title:`${page.title.slice(0,180)} (Kopie)`});if(result.ok)onReplace(result.value);else setError(result.error)}})}><Copy size={14}/>Seite duplizieren</Button>
            <Button onClick={()=>void operation(async()=>{if(await session.flush()){const template=pageFromTemplate(session.snapshot().page,page.workspace_id,'template');template.title=`Vorlage: ${page.title.slice(0,190)}`;const result=await services.saveWorkspacePage(template);if(result.ok)onReplace(result.value);else setError(result.error)}})}>Als Vorlage speichern</Button>
            {page.kind==='template'?<Button onClick={()=>void operation(async()=>{if(await session.flush())await onCreate(page.content.questions.length?'conversation':'note',undefined,session.snapshot().page)})}>Vorlage verwenden</Button>:null}
            <Button onClick={()=>exportPage('md')}><DownloadSimple size={14}/>Markdown exportieren</Button><Button onClick={()=>exportPage('json')}><DownloadSimple size={14}/>JSON exportieren</Button>
            <Button onClick={()=>{patch({archived:!page.archived});void session.flush()}}><Archive size={14}/>{page.archived?'Wiederherstellen':'Archivieren'}</Button>
          </div></details>
        </div>
        <div className="grid min-w-0 gap-7 2xl:grid-cols-[minmax(0,1fr)_225px]">
          <div className="min-w-0">
            <div role="tablist" aria-label="Seitenbereiche" className="mb-6 flex gap-1 overflow-x-auto border-b border-[#061829]/10">{Object.entries({notes:'Notizen',conversation:'Gespräch',links:`Dateien (${page.content.links.length})`,tasks:`Aufgaben (${page.content.tasks.length})`,history:'Verlauf'}).map(([v,l])=><button role="tab" aria-selected={tab===v} type="button" key={v} onClick={()=>loadTab(v)} className={`shrink-0 border-b-2 px-3 py-3 text-xs font-semibold ${tab===v?'border-[#118cff] text-[#0671d1]':'border-transparent text-[#526170]'}`}>{l}</button>)}</div>
            {tab==='notes'?<><BlockEditor blocks={page.content.blocks} onChange={blocks=>content({blocks})}/>{pages.some(p=>p.parent_id===page.id)?<div className="mt-8 border-t border-[#061829]/10 pt-5"><p className="mb-2 text-xs font-bold text-[#697680]">UNTERSEITEN</p>{pages.filter(p=>p.parent_id===page.id).map(p=><a className="flex items-center gap-2 py-2 text-sm text-[#0671d1]" href={`/workspace?page=${p.id}`} key={p.id}>{p.title}<ArrowSquareOut size={13}/></a>)}</div>:null}</>:null}
            {tab==='conversation'?<div className="space-y-6"><div className="grid gap-4 sm:grid-cols-2"><Field label="Gesprächstermin"><input type="datetime-local" className={inputClass} value={page.content.meeting.date} onChange={e=>content({meeting:{...page.content.meeting,date:e.target.value}})}/></Field><Field label="Teilnehmende & Rollen"><input className={inputClass} value={page.content.meeting.participants} maxLength={2000} onChange={e=>content({meeting:{...page.content.meeting,participants:e.target.value}})}/></Field></div>
              <details><summary className="cursor-pointer text-sm font-semibold">Freie Gesprächsnotizen ({page.content.blocks.length} Blöcke)</summary><div className="mt-4"><BlockEditor blocks={page.content.blocks} onChange={blocks=>content({blocks})}/></div></details>
              {!page.content.questions.length?<div className="rounded-xl bg-[#f7f6f1] p-6"><h3 className="font-bold">Mit dem Onboarding-Leitfaden starten</h3><p className="my-3 text-sm text-[#526170]">50 anpassbare Fragen, davon 26 Kernfragen. Alle Antworten bleiben zunächst leer.</p><Button onClick={()=>{const template=onboardingContent();content({questions:template.questions,meeting:{...page.content.meeting,templateVersion:template.meeting.templateVersion}})}}>Leitfaden einfügen</Button></div>:null}
              <QuestionEditor questions={page.content.questions} onChange={questions=>content({questions})}/>
              <Field label="Gespräch zusammenfassen"><textarea className={inputClass} rows={5} value={page.content.meeting.summary} maxLength={20000} onChange={e=>content({meeting:{...page.content.meeting,summary:e.target.value}})} placeholder="Wichtigste Vereinbarungen und nächste Schritte"/></Field><p className="text-xs text-[#697680]">Vorlagenfassung: {page.content.meeting.templateVersion||'Eigene Fragen'} · Antworten ändern keine laufenden Partnerangebote.</p>
            </div>:null}
            {tab==='links'?<ResourcesEditor links={page.content.links} onChange={links=>content({links})}/>:null}
            {tab==='tasks'?<TasksEditor tasks={page.content.tasks} onChange={tasks=>content({tasks})}/>:null}
            {tab==='history'?<div className="space-y-3"><p className="text-sm leading-6 text-[#526170]">Jede erfolgreiche Speicherung erhält eine Version. Wiederherstellen legt eine neue Version an.</p>{versions.map(v=><div key={v.revision} className="flex flex-wrap items-center gap-3 border-b border-[#061829]/10 py-3"><span className="mr-auto text-sm">Version {v.revision} · {new Date(v.created_at).toLocaleString('de-DE')}</span><Button onClick={()=>setVersionPreview(v)}>Ansehen</Button><Button disabled={busy||v.revision===page.revision} onClick={()=>void operation(async()=>{if(!await session.flush())return;if(!window.confirm(`Version ${v.revision} als neue Fassung wiederherstellen?`))return;const result=await services.restoreWorkspacePage(page.id,v.revision,session.snapshot().page.revision);if(result.ok)onReplace(result.value);else setError(result.error)})}>Wiederherstellen</Button></div>)}{moreVersions?<Button disabled={busy} onClick={()=>void operation(()=>loadVersions(versions.length))}>Weitere Versionen</Button>:null}{versionPreview?<div className="rounded-xl bg-[#f7f6f1] p-4"><div className="mb-3 flex justify-between text-sm font-bold">Version {versionPreview.revision}<button onClick={()=>setVersionPreview(null)}>Schließen</button></div><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-6">{exportMarkdown(versionPreview.snapshot)}</pre></div>:null}</div>:null}
          </div>
          <div className="self-start 2xl:sticky 2xl:top-24"><PartnerContext partnerId={page.partner_id} onChange={partner_id=>patch({partner_id})} services={services}/><p className="mt-3 px-1 text-xs leading-5 text-[#697680]">Interner Workspace. Partner können diese Notizen nicht sehen.</p></div>
        </div>
      </div>
    </div>
  </section>
}
