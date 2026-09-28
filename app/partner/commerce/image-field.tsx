'use client'

import Image from 'next/image'
import { useId, useState } from 'react'
import { commerceImageUrl } from '@/lib/commerce/images'

export function CommerceImageField({name,label,value='',imageOrigin}:{name:string;label:string;value?:string;imageOrigin:string}) {
  const [draft,setDraft]=useState(value)
  const id=useId()
  let url:string|null=null
  let invalid=false
  try {url=commerceImageUrl(draft)} catch {invalid=true}
  // Local image paths belong to the public booking website, not the admin host.
  const previewUrl=url?.startsWith('/')?new URL(url,imageOrigin).href:url
  return <div className="space-y-2 text-sm">
    <label htmlFor={id}>{label}</label>
    <input id={id} name={name} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" maxLength={2000} value={draft} placeholder="https://… oder /images/bild.webp" aria-describedby={`${id}-hint`} aria-invalid={invalid} onChange={event=>{
      setDraft(event.target.value)
      try {commerceImageUrl(event.target.value);event.target.setCustomValidity('')} catch {event.target.setCustomValidity('Bitte eine HTTPS-Bildadresse oder einen lokalen Bildpfad eingeben.')}
    }}/>
    <p id={`${id}-hint`} className={invalid?'text-rose-700':'text-xs text-slate-500'}>{invalid?'Bitte eine HTTPS-Bildadresse ohne Zugangsdaten oder einen lokalen Bildpfad eingeben.':'HTTPS oder lokaler Pfad. Leer lassen, um das Bild zu entfernen. Verwende eigene freigegebene Bilder.'}</p>
    {previewUrl&&<ImagePreview key={previewUrl} url={previewUrl} label={label}/>}
  </div>
}
function ImagePreview({url,label}:{url:string;label:string}) {
  const [failed,setFailed]=useState(false)
  return failed?<p role="status" className="text-xs text-amber-800">Bild konnte nicht geladen werden. Bitte die Adresse prüfen.</p>:<div className="relative h-40 overflow-hidden rounded-xl bg-slate-100"><Image src={url} alt={`Vorschau: ${label}`} fill sizes="(max-width: 640px) 100vw, 500px" className="object-cover" unoptimized onError={()=>setFailed(true)}/></div>
}
