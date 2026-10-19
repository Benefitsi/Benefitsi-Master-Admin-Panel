import {requireAdmin} from '@/lib/admin'
import {AcquisitionApp} from '@/components/acquisition/acquisition-app'
import {AdminShell} from '../../admin-shell'
import {loadAcquisitionIndex} from './actions'

export const dynamic = 'force-dynamic'

export default async function AcquisitionPage() {
  const {adminSession} = await requireAdmin()
  const initial = await loadAcquisitionIndex()
  const adminName = adminSession.profile?.display_name || adminSession.user.email || 'Admin'
  return <AdminShell title="Akquise & Kontakte" subtitle="Partner · Gespräche und Wiedervorlagen" adminName={adminName}>
    <AcquisitionApp initial={initial}/>
  </AdminShell>
}
