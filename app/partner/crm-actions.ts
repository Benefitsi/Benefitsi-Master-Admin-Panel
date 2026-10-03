'use server'
import {createClient} from '@/lib/supabase/server'
import {getPartnerPortalSession} from '@/lib/partner-portal'
import {requireAdmin} from '@/lib/admin'
import {crmError,readCrmDashboard,readCrmDeals,saveCrmCampaign,requestEditorialService,updateEditorialService,validCrmUuid,type CrmRead,type CrmDeals,type CrmCampaign,type EditorialRequest,type AdminEditorialRequest,type EditorialKey,type EditorialStatus} from '@/lib/partners/crm'
export type CrmActionResult<T> = {ok:true;value:T;message:string} | {ok:false;message:string;code:string}
export type CrmWorkspaceData = {actorId:string;initial:CrmRead;deals:CrmDeals}
async function scopedClient(partnerId:string) {
  if(!validCrmUuid(partnerId))throw crmError({message:'crm_invalid_campaign'})
  const client=await createClient(), session=await getPartnerPortalSession(client)
  if(!session||(!session.isAdmin&&!session.partnerIds.includes(partnerId)))throw crmError({code:'42501'})
  return {client,actorId:session.user.id}
}
function failure(error:unknown) {const e=crmError(error);return {ok:false as const,code:e.code,message:e.message}}
export async function loadPartnerCrm(partnerId:string):Promise<CrmActionResult<CrmWorkspaceData>> {
  try {
    const {client,actorId}=await scopedClient(partnerId),initial=await readCrmDashboard(client,partnerId)
    const deals:CrmDeals=initial.status==='ready'?await readCrmDeals(client,partnerId):{status:'unavailable',message:'Vorteile benötigen den freigegebenen Kundenbindungsbereich.'}
    return {ok:true,value:{actorId,initial,deals},message:''}
  }catch(error){return failure(error)}
}
export async function savePartnerCrm(partnerId:string,input:unknown):Promise<CrmActionResult<CrmCampaign>> {
  try {const {client}=await scopedClient(partnerId);return {ok:true,value:await saveCrmCampaign(client,partnerId,input),message:'Entwurf gespeichert. Es wurde keine Nachricht versendet.'}}catch(error){return failure(error)}
}
export async function requestPartnerEditorial(partnerId:string,service:EditorialKey,note:string):Promise<CrmActionResult<EditorialRequest>> {
  try {const {client}=await scopedClient(partnerId);return {ok:true,value:await requestEditorialService(client,partnerId,service,note),message:'Anfrage gespeichert. Das Benefitsi-Team stimmt Umfang und Termin mit dir ab.'}}catch(error){return failure(error)}
}
export async function updatePartnerEditorial(partnerId:string,service:EditorialKey,status:EditorialStatus,note:string):Promise<CrmActionResult<AdminEditorialRequest>> {
  try {const {supabase}=await requireAdmin();return {ok:true,value:await updateEditorialService(supabase,partnerId,service,status,note),message:'Redaktionsstatus gespeichert.'}}catch(error){return failure(error)}
}
