import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { accountIdentity, commerceAccount, type AccountDependencies } from './account'
export function accountDependencies(admin=createAdminClient()):AccountDependencies {
  return {
    verifyUser:async token=>{const {data,error}=await admin.auth.getUser(token);return error?null:data.user},
    rpc:async(name,args)=>{const result=await admin.rpc(name,args);if(result.error)throw Error(result.error.message);return result.data},
  }
}
export function accountRequest(value:unknown) { return commerceAccount(value,accountDependencies()) }
export function bookingCustomerIdentity(token:unknown,partnerId:string) {return accountIdentity(token,partnerId,accountDependencies())}
