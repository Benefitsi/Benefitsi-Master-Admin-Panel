"use client"
import { useRouter } from "next/navigation"
import type { KnowledgeProfile } from "@/lib/benefitsi-knowledge-controls"
import { BenefitsiNoteComposer } from "./benefitsi-note-composer"
export function BenefitsiKnowledgeEntry({ profileId }: { profileId?: KnowledgeProfile }) {
  const router = useRouter()
  return <BenefitsiNoteComposer profileId={profileId} onSaved={() => router.refresh()} />
}
