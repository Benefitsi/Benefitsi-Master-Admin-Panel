import { validatePage, pagePayload } from '../../lib/workspace/model.ts'

// Transport boundary only: React editors and document validation stay real.
// PostgreSQL authorization, constraints and RPC transactions are tested in the DB repository.
export const fixturePartner = {id:'00000000-0000-4000-8000-000000000099',name:'Café Beispiel',slug:'cafe-beispiel',publicSlug:'cafe-beispiel'}
export function workspaceFixture(seed = {}) {
  const workspaces = new Map((seed.workspaces ?? []).map(w => [w.id, structuredClone(w)]))
  const pages = new Map((seed.pages ?? []).map(p => [p.id, structuredClone(p)]))
  const favorites = new Set(seed.favorites ?? [])
  const versions = new Map([...pages.values()].map(p => [p.id, [{revision:p.revision,created_at:p.updated_at,snapshot:structuredClone(p)}]]))
  const ok = value => ({ok:true,value:structuredClone(value)})
  const fail = error => ({ok:false,error})
  const services = {
    async loadWorkspaceIndex() { return ok({workspaces:[...workspaces.values()],favorites:[...favorites]}) },
    async loadWorkspacePages(id, filter = {}, offset = 0) {
      const matches = [...pages.values()].filter(p => p.workspace_id===id && p.archived===(filter.archived===true)
        && (!filter.kind || p.kind===filter.kind) && (!filter.status || p.status===filter.status)
        && (!filter.partnerId || p.partner_id===filter.partnerId) && (!filter.tag || p.tags.includes(filter.tag))
        && (!filter.query || JSON.stringify(p).toLowerCase().includes(filter.query.toLowerCase())))
      return ok({pages:matches.slice(offset,offset+100),total:matches.length})
    },
    async loadWorkspacePage(id) { return pages.has(id) ? ok(pages.get(id)) : fail('Seite nicht gefunden.') },
    async saveWorkspacePage(input) {
      let page
      try { page=validatePage(input) } catch(error) { return fail(error.message) }
      const previous=pages.get(page.id)
      if(previous && page.revision===0 && previous.revision===1 && JSON.stringify(pagePayload(previous))===JSON.stringify(pagePayload(page))) return ok(previous)
      if(previous && previous.revision!==page.revision) return {ok:false,error:'Versionskonflikt. Dein Entwurf bleibt erhalten.',conflict:structuredClone(previous)}
      const saved={...page,revision:(previous?.revision??0)+1,created_at:previous?.created_at??new Date().toISOString(),updated_at:new Date().toISOString()}
      pages.set(page.id,saved)
      versions.set(page.id,[{revision:saved.revision,created_at:saved.updated_at,snapshot:structuredClone(saved)},...(versions.get(page.id)??[])])
      return ok(saved)
    },
    async saveWorkspace(input) {
      const previous=workspaces.get(input.id)
      if(previous && previous.revision!==input.revision) return fail('Arbeitsbereich inzwischen geändert.')
      const saved={...input,revision:(previous?.revision??0)+1,created_at:previous?.created_at??new Date().toISOString(),updated_at:new Date().toISOString()}
      workspaces.set(input.id,saved)
      return ok(saved)
    },
    async setWorkspaceFavorite(id,value) { if(value)favorites.add(id);else favorites.delete(id);return ok(value) },
    async loadWorkspaceVersions(id,offset=0) { return ok((versions.get(id)??[]).slice(offset,offset+10)) },
    async restoreWorkspacePage(id,revision,expected) {
      const saved=versions.get(id)?.find(v=>v.revision===revision)?.snapshot
      return saved ? services.saveWorkspacePage({...saved,revision:expected}) : fail('Version nicht gefunden.')
    },
    async findWorkspacePartners(query='',id) { return ok((!id||id===fixturePartner.id) && fixturePartner.name.toLowerCase().includes(query.toLowerCase()) ? [fixturePartner] : []) },
  }
  return {services,workspaces,pages,favorites,versions}
}
