/** Structured editorial media. Publication adds current permission separately;
 * a saved approval is content evidence, never a tariff grant. */
export type RichMedia = {kind:'video'|'panorama'|'tour';url:string;poster:string;title:string;description:string;rightsConfirmed:boolean;approved:boolean}
export function mediaSource(value:unknown, kind:RichMedia['kind']|'poster'):string {
  if(typeof value!=='string'||value.length>2048||/[\\\s\u0000-\u001f]/.test(value)) return ''
  try {
    const url=new URL(value)
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash) return ''
    if(kind==='video'||kind==='poster') {
      if(!['benefitsi.de','admin.benefitsi.de'].includes(url.hostname)||!url.pathname.startsWith('/media/')||!/^[\w/.-]+$/.test(url.pathname)) return ''
      if(!(kind==='video'?/\.mp4$/i:/\.(jpg|jpeg|png|webp)$/i).test(url.pathname)) return ''
    } else if(url.hostname==='kuula.co') {
      if(!/^\/share\/(?:collection\/)?[A-Za-z0-9_-]+$/.test(url.pathname)) return ''
      if(kind==='tour'&&!url.pathname.startsWith('/share/collection/')) return ''
      if(kind==='panorama'&&url.pathname.startsWith('/share/collection/')) return ''
    } else return ''
    return url.href
  } catch {return ''}
}
export function validateRichMedia(value:unknown):RichMedia|null {
  if(!value||typeof value!=='object'||Array.isArray(value)) return null
  const v=value as Record<string,unknown>
  if(!['video','panorama','tour'].includes(String(v.kind))) return null
  const kind=v.kind as RichMedia['kind'],url=mediaSource(v.url,kind),poster=mediaSource(v.poster,'poster')
  if(typeof v.description!=='string'||!v.description.trim()||v.description.length>1000) return null
  if(!url||!poster||typeof v.title!=='string'||!v.title.trim()||v.title.length>120) return null
  return {kind,url,poster,title:v.title.trim(),description:v.description.trim(),rightsConfirmed:v.rightsConfirmed===true,approved:v.approved===true}
}
export function approvedRichMedia(value:unknown, permitted:unknown):RichMedia|null {
  const media=validateRichMedia(value)
  return permitted===true&&media?.approved&&media.rightsConfirmed?media:null
}
export function mediaNavigation<T extends {anchor:string;label:string}>(links:T[],media:RichMedia|null):Array<{anchor:string;label:string}> {
  const result=links.filter(l=>l.anchor!=='einblicke')
  if(!media) return result
  const index=result.findIndex(l=>l.anchor==='ueber-uns')
  return [...result.slice(0,index+1),{anchor:'einblicke',label:'Einblicke'},...result.slice(index+1)]
}
