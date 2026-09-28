import { requireCommerceProxy, requestBody, commerceError } from '@/lib/commerce/http'
import { accountRequest } from '@/lib/commerce/account-service'
export async function POST(request:Request) {
  try {requireCommerceProxy(request);return Response.json(await accountRequest(await requestBody(request)),{headers:{'Cache-Control':'private, no-store'}})}
  catch(error){return commerceError(error)}
}
