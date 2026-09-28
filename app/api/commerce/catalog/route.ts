import { requireCommerceProxy, commerceError } from '@/lib/commerce/http'
import { publicCatalog } from '@/lib/commerce/service'
export async function GET(request:Request) {try {requireCommerceProxy(request);return Response.json(await publicCatalog(new URL(request.url).searchParams.get('partnerId')||''),{headers:{'Cache-Control':'no-store'}})}catch(error){return commerceError(error)}}
