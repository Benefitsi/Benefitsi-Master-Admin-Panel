import { pageFingerprint, type ActionResult, type WorkspacePage } from './model'

export type SaveSnapshot = {page:WorkspacePage;state:'saved'|'dirty'|'saving'|'error'|'conflict';message:string;server?:WorkspacePage}
export class DocumentSession {
  private value: SaveSnapshot
  private stored: WorkspacePage
  private listeners = new Set<()=>void>()
  private timer?: ReturnType<typeof setTimeout>
  private flight?: Promise<boolean>
  private disposed=false
  constructor(page:WorkspacePage,private save:(page:WorkspacePage)=>Promise<ActionResult<WorkspacePage>>,private onSaved:(page:WorkspacePage)=>void,private delay=900) {
    this.stored=page;this.value={page,state:'saved',message:''}
  }
  snapshot=()=>this.value
  activate(){this.disposed=false}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener)}}
  dirty=()=>pageFingerprint(this.value.page)!==pageFingerprint(this.stored)
  private publish(next:SaveSnapshot){this.value=next;if(!this.disposed)this.listeners.forEach(listener=>listener())}
  edit(page:WorkspacePage){
    clearTimeout(this.timer)
    this.publish({...this.value,page,state:this.value.state==='conflict'?'conflict':this.flight?'saving':'dirty'})
    if(this.value.state!=='conflict')this.timer=setTimeout(()=>{void this.flush()},this.delay)
  }
  async flush():Promise<boolean>{
    clearTimeout(this.timer)
    if(this.value.state==='conflict')return false
    if(this.flight){const success=await this.flight;if(!success)return false;return this.dirty()?this.flush():true}
    if(!this.dirty())return true
    const sent=this.value.page
    this.publish({...this.value,state:'saving',message:''})
    const run=async()=>{
      try {
        const result=await this.save(sent)
        if(!result.ok){this.publish({...this.value,state:result.conflict?'conflict':'error',message:result.error,server:result.conflict});return false}
        this.stored=result.value
        const unchanged=pageFingerprint(this.value.page)===pageFingerprint(sent)
        this.publish({page:unchanged?result.value:{...this.value.page,revision:result.value.revision,updated_at:result.value.updated_at},state:unchanged?'saved':'dirty',message:''})
        if(!this.disposed)this.onSaved(result.value)
        return true
      }catch {this.publish({...this.value,state:'error',message:'Speichern fehlgeschlagen. Dein Entwurf bleibt hier erhalten.'});return false}
    }
    this.flight=run()
    const success=await this.flight
    this.flight=undefined
    return success && this.dirty()?this.flush():success
  }
  acceptServer(){if(this.value.server){this.stored=this.value.server;this.publish({page:this.stored,state:'saved',message:''});this.onSaved(this.stored)}}
  dispose(){this.disposed=true;clearTimeout(this.timer);this.listeners.clear()}
}
