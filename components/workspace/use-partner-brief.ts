'use client'
import { useEffect, useRef, useState } from 'react'
import type { PartnerBrief } from '@/lib/workspace/partner-brief'
import type { WorkspaceServices } from './services'

export function usePartnerBrief(partnerId:string|null,services:WorkspaceServices) {
  const [state,setState]=useState<{partnerId:string|null;brief:PartnerBrief|null;loading:boolean;error:string}>({partnerId:null,brief:null,loading:false,error:''})
  const refresh=useRef<()=>void>(()=>{})
  useEffect(()=>{
    let active=true,request=0
    const load=async()=>{
      if(!partnerId)return
      const current=++request
      setState({partnerId,brief:null,loading:true,error:''})
      try{
        const result=await services.loadWorkspacePartnerBrief(partnerId)
        if(!active||current!==request)return
        if(result.ok&&result.value.partnerId===partnerId)setState({partnerId,brief:result.value,loading:false,error:''})
        else setState({partnerId,brief:null,loading:false,error:result.ok?'Die Daten passen nicht zum verknüpften Partner.':result.error})
      }catch{if(active&&current===request)setState({partnerId,brief:null,loading:false,error:'Die Admin-Daten konnten nicht geladen werden. Bitte erneut versuchen.'})}
    }
    refresh.current=()=>void load()
    if(partnerId)void load()
    const focus=()=>void load()
    window.addEventListener('focus',focus)
    return()=>{active=false;refresh.current=()=>{};window.removeEventListener('focus',focus)}
  },[partnerId,services])
  return {brief:state.partnerId===partnerId?state.brief:null,error:state.partnerId===partnerId?state.error:'',loading:Boolean(partnerId)&&(state.partnerId!==partnerId||state.loading),refresh:()=>refresh.current()}
}
