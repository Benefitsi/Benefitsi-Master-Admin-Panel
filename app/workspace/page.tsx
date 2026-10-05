import type { Metadata } from 'next'
import { AdminShell } from '@/app/admin-shell'
import { requireAdmin } from '@/lib/admin'
import { loadWorkspaceIndex } from './actions'
import { WorkspaceApp } from '@/components/workspace/workspace-app'

export const dynamic='force-dynamic'
export const metadata:Metadata={title:'Workspace',description:'Interne Notizen, Ideen und Partnergespräche.'}
export default async function WorkspaceRoute({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {adminSession}=await requireAdmin()
  const [initial,params]=await Promise.all([loadWorkspaceIndex(),searchParams])
  const one=(v:string|string[]|undefined)=>Array.isArray(v)?v[0]:v
  return <AdminShell title="Workspace" subtitle="Notizen, Ideen und Partnergespräche" adminName={adminSession.profile?.display_name||adminSession.user.email||'Admin'}>
    <WorkspaceApp initial={initial} initialPageId={one(params.page)} initialPartnerId={one(params.partner)} />
  </AdminShell>
}
