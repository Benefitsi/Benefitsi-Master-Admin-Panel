'use server'

import { requestFinance } from '@/lib/finance-agent-server'
import type { FinanceRun, FinanceStatus } from '@/lib/finance-agent'

export async function startFinanceCheck(task: 'setup' | 'review', requestId: string): Promise<{ run?: FinanceRun; error?: string }> {
  try {
    if (task !== 'setup' && task !== 'review') throw new Error('Ungültige Finanzaufgabe.')
    return { run: await requestFinance(task, { requestId }) as FinanceRun }
  }
  catch { return { error: 'Der Prüflauf konnte nicht bestätigt werden. Finanzberechtigung und M1-Verbindung prüfen; bei unklarem Ausgang denselben Aufruf erneut versuchen.' } }
}

export async function refreshFinanceStatus(): Promise<{ data?: FinanceStatus; error?: string }> {
  try { return { data: await requestFinance('status') as FinanceStatus } }
  catch { return { error: 'Kein aktueller Finanzstatus abrufbar. Die vorige Beobachtung bleibt datiert.' } }
}
