import { NextResponse } from 'next/server'
import { seoWorkerAuthorized } from '@/lib/seo/google-auth'
import { createCollectionStore, collectionCredentials } from '@/lib/seo/collection-store'
import { runCollectionTick } from '@/lib/seo/collection-runner'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=300

export async function POST(request:Request) {
  if(!seoWorkerAuthorized(request.headers.get('authorization'),process.env.CRON_SECRET))return NextResponse.json({error:'unauthorized'},{status:401})
  try{
    return NextResponse.json(await runCollectionTick(createCollectionStore(),collectionCredentials()),{headers:{'Cache-Control':'no-store'}})
  }catch{return NextResponse.json({error:'collection_failed'},{status:500,headers:{'Cache-Control':'no-store'}})}
}
