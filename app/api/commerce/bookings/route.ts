import { requireCommerceProxy, commerceError, requestBody } from '@/lib/commerce/http'
import { createCommerceBooking } from '@/lib/commerce/service'
export async function POST(request:Request) {try {requireCommerceProxy(request);return Response.json(await createCommerceBooking(await requestBody(request)),{status:201,headers:{'Cache-Control':'no-store'}})}catch(error){return commerceError(error)}}
