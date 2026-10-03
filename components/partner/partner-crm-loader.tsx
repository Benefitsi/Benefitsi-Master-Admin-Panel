'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { loadPartnerCrm } from '@/app/partner/crm-actions';
import { PartnerCrmWorkspace } from '@/components/partner/partner-crm-workspace';
import type { CrmRead, CrmDeals } from '@/lib/partners/crm';
export function PartnerCrmLoader({
  partnerId,
  actorId,
  initial,
  deals,
  initialError = ''
}: {
  partnerId: string;
  actorId: string;
  initial: CrmRead | null;
  deals: CrmDeals;
  initialError?: string;
}) {
  const [snapshot, setSnapshot] = useState<{
    initial: CrmRead;
    deals: CrmDeals;
  } | null>(initial ? {
    initial,
    deals
  } : null),
    [error, setError] = useState(initialError),
    [epoch, setEpoch] = useState(0);
  const sequence = useRef(0),
    actor = useRef<string | null>(actorId),
    mounted = useRef(true);
  const refresh = useCallback(async () => {
    const request = ++sequence.current,
      requestedActor = actor.current;
    if (!requestedActor) return;
    try {
      const result = await loadPartnerCrm(partnerId);
      if (!mounted.current || request !== sequence.current || requestedActor !== actor.current) return;
      if (!result.ok) {
        setSnapshot(null);
        setError(result.message);
        return;
      }
      if (result.value.actorId !== requestedActor || result.value.initial.status === 'ready' && result.value.initial.dashboard.partner_id !== partnerId) {
        setSnapshot(null);
        setError('Bitte deinen Zugriff aktualisieren.');
        return;
      }
      setSnapshot({
        initial: result.value.initial,
        deals: result.value.deals
      });
      setError('');
    } catch {
      if (mounted.current && request === sequence.current) {
        setSnapshot(null);
        setError('Kundenbindung konnte nicht geladen werden. Bitte erneut versuchen.');
      }
    }
  }, [partnerId]);
  const accessLost = useCallback(() => {
    ++sequence.current;
    setSnapshot(null);
    setEpoch(v => v + 1);
    setError('Bitte deinen Zugriff aktualisieren.');
    void refresh();
  }, [refresh]);
  useEffect(() => {
    mounted.current = true;
    window.addEventListener('focus', refresh);
    const {
      data
    } = createClient().auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (next !== actor.current) {
        actor.current = next;
        ++sequence.current;
        setSnapshot(null);
        setEpoch(v => v + 1);
        setError('Bitte deinen Zugriff aktualisieren.');
        if (next) void refresh();
      } else if (_event === 'TOKEN_REFRESHED') void refresh();
    });
    return () => {
      mounted.current = false;
      ++sequence.current;
      window.removeEventListener('focus', refresh);
      data.subscription.unsubscribe();
    };
  }, [refresh]);
  if (!snapshot) return <section className="rounded-2xl border border-slate-200 bg-white p-6">
    <p role="alert" className="text-sm leading-6 text-slate-600">
      {error || 'Kundenbindung wird geladen …'}
    </p>
    <button type="button" className="mt-4 min-h-11 rounded-xl border border-slate-200 px-4 font-semibold text-[#0874d1]" onClick={() => void refresh()}>Zugriff und Daten erneut laden</button>
  </section>;
  return <PartnerCrmWorkspace key={`${partnerId}:${actor.current}:${epoch}`} partnerId={partnerId} initial={snapshot.initial} deals={snapshot.deals} onAccessLost={accessLost} />;
}
