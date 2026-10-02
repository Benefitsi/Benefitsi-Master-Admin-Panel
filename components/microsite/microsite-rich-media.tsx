'use client'
import {useState} from 'react'
import {approvedRichMedia,type RichMedia} from '@/lib/microsite-rich-media'
/** No player, source or iframe exists before explicit interaction. */
export function MicrositeRichMedia({media,tour,permitted}:{media?:RichMedia|null;tour?:RichMedia|null;permitted?:boolean}) {
  const primary=approvedRichMedia(media,permitted)
  const secondary=approvedRichMedia(tour,permitted)
  const safeTour=secondary?.kind!=="video" && (!primary || primary.kind==="video") ? secondary : null
  if(!primary && !safeTour) return null
  return <section id="einblicke" aria-labelledby="einblicke-heading" style={{maxWidth:1152,margin:'48px auto',padding:24,color:'inherit'}}>
    <h2 id="einblicke-heading" style={{fontSize:14,letterSpacing:3,textTransform:'uppercase'}}>Einblicke</h2>
    {primary && <MediaPlayer key={primary.url} safe={primary}/>}
    {safeTour && <MediaPlayer key={safeTour.url} safe={safeTour}/>}
  </section>
}
function MediaPlayer({safe}:{safe:RichMedia}) {
  const [started,setStarted]=useState<string|null>(null)
  const action=safe.kind==='video'?'Video ansehen':safe.kind==='panorama'?'360°-Ansicht öffnen':'Rundgang starten'
  return <article style={{marginTop:24}}>
    <h3 style={{fontSize:'clamp(28px,4vw,44px)',fontWeight:700,margin:'12px 0 24px'}}>{safe.title}</h3>
    <p style={{marginBottom:16}}>{safe.description}</p>
    <div style={{position:'relative',aspectRatio:'16 / 9',overflow:'hidden',borderRadius:24,background:'#182321'}}>
      {started===safe.url? safe.kind==='video'?<video controls playsInline preload="none" poster={safe.poster} src={safe.url} aria-label={safe.title} style={{width:'100%',height:'100%'}}/>:<iframe title={safe.title} src={`${safe.url}?logo=0&info=0&fs=1&vr=0&sd=1&thumbs=1`} allow="fullscreen" allowFullScreen referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups" style={{border:0,width:'100%',height:'100%'}}/>:<>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={safe.poster} loading="lazy" alt="" style={{width:'100%',height:'100%',objectFit:'cover',opacity:.75}}/>
        <button type="button" onClick={()=>setStarted(safe.url)} style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',border:0,borderRadius:999,padding:'16px 24px',background:'white',color:'#182321',fontWeight:700,minHeight:48,cursor:'pointer',whiteSpace:'nowrap'}}>{action} <span aria-hidden="true">↗</span></button>
      </>}
    </div>
    <p style={{fontSize:14,marginTop:14}}>{safe.kind==='video'?'Das Video startet erst nach deiner Auswahl.':'Der externe Player wird erst nach deiner Auswahl geladen.'} <a href={safe.url} target="_blank" rel="noopener noreferrer" style={{textDecoration:'underline'}}>{safe.kind==='video'?'Video separat öffnen':safe.kind==='panorama'?'360°-Ansicht separat öffnen':'Rundgang separat öffnen'}</a></p>
  </article>
}
