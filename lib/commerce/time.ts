/** Resolve German wall time explicitly, never in the server's timezone. */
export function berlinDateTime(value:string) {
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) throw new Error('invalid_datetime')
  const wall=Date.parse(`${value}:00Z`),matches:string[]=[]
  const format=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
  for(const offset of [60,120]) {
    const candidate=new Date(wall-offset*60000)
    if(Number.isFinite(candidate.getTime())&&format.format(candidate).replace(' ','T')===value) matches.push(candidate.toISOString())
  }
  if(matches.length!==1) throw new Error('ambiguous_or_invalid_berlin_time')
  return matches[0]
}
