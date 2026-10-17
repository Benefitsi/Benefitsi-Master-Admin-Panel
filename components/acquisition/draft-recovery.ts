'use client'

import type {AcquisitionDocument, ContactChannel} from '../../lib/acquisition/model'

export type AcquisitionDraftRecovery = {
  document: AcquisitionDocument
  acknowledgedSnapshot: string
  acknowledgedContactIds: string[]
  contact: {date: string; channel: ContactChannel; note: string}
}

// Same-document lifetime only: no local/session storage, server write or history
// rewrite. Retain one abandoned editor across App Router unmounts in this tab.
let recovery: AcquisitionDraftRecovery | null = null
const listeners = new Set<() => void>()
export const readAcquisitionDraftRecovery = () => recovery
export const serverAcquisitionDraftRecovery = () => null
export function subscribeAcquisitionDraftRecovery(listener: () => void) {
  listeners.add(listener)
  return () => {listeners.delete(listener)}
}
export function retainAcquisitionDraftRecovery(draft: AcquisitionDraftRecovery | null) {
  recovery = draft ? structuredClone(draft) : null
  listeners.forEach(listener => listener())
}
