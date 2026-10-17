'use server'

import {requireAdmin} from '@/lib/admin'
import {createAcquisitionData} from '@/lib/acquisition/data'
import {saveWorkspace,saveWorkspacePage} from '@/app/workspace/actions'
import type {ActionResult,Workspace} from '@/lib/workspace/model'
import type {AcquisitionIndex,AcquisitionDocument,AcquisitionTarget} from '@/lib/acquisition/model'

export async function loadAcquisitionIndex():Promise<ActionResult<AcquisitionIndex>>{
 const {supabase}=await requireAdmin()
 return createAcquisitionData(supabase,{saveWorkspace,saveWorkspacePage}).loadAcquisitionIndex()
}
export async function loadAcquisitionDocument(target:AcquisitionTarget):Promise<ActionResult<AcquisitionDocument>>{
 const {supabase}=await requireAdmin()
 return createAcquisitionData(supabase,{saveWorkspace,saveWorkspacePage}).loadAcquisitionDocument(target)
}
export async function saveAcquisitionDocument(input:AcquisitionDocument):Promise<ActionResult<AcquisitionDocument>>{
 const {supabase}=await requireAdmin()
 return createAcquisitionData(supabase,{saveWorkspace,saveWorkspacePage}).saveAcquisitionDocument(input)
}
export async function createAcquisitionWorkspace(id:string):Promise<ActionResult<Workspace>>{
 const {supabase}=await requireAdmin()
 return createAcquisitionData(supabase,{saveWorkspace,saveWorkspacePage}).createAcquisitionWorkspace(id)
}
