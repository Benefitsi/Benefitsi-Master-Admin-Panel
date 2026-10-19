import {makePage} from '../../lib/workspace/model.ts'
import {workspaceFixture} from './workspace-fixture.mjs'
export const workspaceId='00000000-0000-4000-8000-000000000001'
export const partnerId='00000000-0000-4000-8000-000000000002'
export const workspace={id:workspaceId,title:'Akquise & Kontakte',description:'Interne Akquise und Kontaktverläufe',revision:1,archived:false,created_at:'2026-10-17T10:00:00Z',updated_at:'2026-10-17T10:00:00Z'}
export const partner={id:partnerId,name:'Hotel',city_id:workspaceId,type:'Hotel',email:'info@example.test',phone:'123',website:'https://example.test'}

// Only external boundaries are replaced. Acquisition codecs, validation and
// revision checks run production code; Workspace's fixture represents its RPC transaction.
export function acquisitionFixture(seed={}) {
  const storage=workspaceFixture({workspaces:seed.workspaces??[workspace],pages:seed.pages??[]})
  const reads=[]
  const client={from(table){
    const filters=[]
    let columns=''
    const q={
      select(value){columns=value;return q},
      eq(key,value){filters.push([key,value]);return q},
      contains(key,value){filters.push([key,value]);return q},
      order(){return q},
      range(from,to){
        reads.push({table,columns,filters,from,to})
        const response=seed.failRange?.(table,from)
          ?{data:null,error:{message:'read failed'}}
          :{data:rows().slice(from,to+1),error:null}
        return {returns(){return this},then(resolve){return Promise.resolve(response).then(resolve)}}
      },
      async maybeSingle(){
        reads.push({table,columns,filters})
        const selected=rows()
        return {data:selected[0]??null,error:selected.length>1?{message:'multiple'}:null}
      },
    }
    function rows(){
      const all=table==='partners'?(seed.partners??[partner])
        :table==='cities'?(seed.cities??[{id:workspaceId,name:'Berlin'}])
        :table==='admin_workspaces'?[...storage.workspaces.values()]
        :table==='admin_workspace_pages'?[...storage.pages.values()]:null
      if(!all)throw new Error(`unexpected table ${table}`)
      return all.filter(row=>filters.every(([k,v])=>Array.isArray(v)?v.every(x=>row[k]?.includes(x)):row[k]===v))
        .map(row=>Object.fromEntries(columns.split(',').map(k=>[k,structuredClone(row[k])])))
    }
    return q
  }}
  return {...storage,client,reads,newPage:()=>makePage(workspaceId,'partner')}
}
