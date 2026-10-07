'use server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin'
import { readPartnerDetails, savePartnerDetail, addPartnerDetail, type PartnerDetailChange, type PartnerDetailAddition, type PartnerDetails, type EditRow } from '@/lib/workspace/partner-edit'
import type { ActionResult } from '@/lib/workspace/model'
import { invalidatePublicPartner } from '@/lib/public-web-revalidation'

export async function loadWorkspacePartnerDetails(partnerId:string):Promise<ActionResult<PartnerDetails>>{
  const {supabase}=await requireAdmin()
  try{return {ok:true,value:await readPartnerDetails(supabase,partnerId)}}catch(error){return {ok:false,error:error instanceof Error?error.message:'Partnerangaben konnten nicht geladen werden.'}}
}
export async function saveWorkspacePartnerDetail(partnerId:string,input:PartnerDetailChange):Promise<ActionResult<EditRow>>{
  const {supabase}=await requireAdmin()
  try{
    const value=await savePartnerDetail(supabase,partnerId,input)
    revalidatePath('/partners');revalidatePath('/partner');revalidatePath('/workspace')
    await invalidatePublicPartner(supabase,partnerId)
    return {ok:true,value}
  }catch(error){return {ok:false,error:error instanceof Error?error.message:'Die Änderung konnte nicht gespeichert werden.'}}
}
export async function addWorkspacePartnerDetail(partnerId:string,input:PartnerDetailAddition):Promise<ActionResult<EditRow>>{
  const {supabase}=await requireAdmin()
  try{
    const value=await addPartnerDetail(supabase,partnerId,input)
    revalidatePath('/partners');revalidatePath('/partner');revalidatePath('/workspace')
    await invalidatePublicPartner(supabase,partnerId)
    return {ok:true,value}
  }catch(error){return {ok:false,error:error instanceof Error?error.message:'Der Eintrag konnte nicht gespeichert werden.'}}
}
