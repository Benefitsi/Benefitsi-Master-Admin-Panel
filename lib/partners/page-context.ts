import "server-only";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPartnerPortalSession } from "@/lib/partner-portal";
import { readEntitlements } from "./entitlements";
export async function partnerPageContext(requested: string | undefined) {
  const client = await createClient(),
    session = await getPartnerPortalSession(client);
  if (!session || (!session.isAdmin && !session.partnerIds.length))
    redirect("/partner/login");
  const query = client.from("partners").select("id,name").order("name");
  const { data, error } = session.isAdmin
    ? await query
    : await query.in("id", session.partnerIds);
  if (error) throw new Error("Betriebe konnten nicht geladen werden.");
  const partners = (data ?? []).map((p) => ({
    id: String(p.id),
    name: String(p.name ?? "Mein Betrieb"),
  }));
  const partnerId = requested || partners[0]?.id;
  if (!partnerId || !partners.some((p) => p.id === partnerId)) notFound();
  const rights = await readEntitlements(client, partnerId);
  return {
    client,
    session,
    isAdmin: session.isAdmin,
    accountName:
      session.profile?.display_name ||
      session.profile?.email ||
      session.user?.email ||
      "Partner",
    partners,
    partnerId,
    rights,
    name: partners.find((p) => p.id === partnerId)!.name,
  };
}
