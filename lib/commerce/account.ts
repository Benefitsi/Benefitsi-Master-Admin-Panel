import { record, uuid } from './requests.ts'
import { createHash } from 'node:crypto'
type Row = Record<string, unknown>
export type AccountDependencies = {
  verifyUser: (accessToken:string) => Promise<{id:string;is_anonymous?:boolean}|null>
  rpc: (name:string,args:Row) => Promise<unknown>
  profile?: (userId:string) => Promise<{name:string;email:string}>
}
export function accountToken(value:unknown):string {
  if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)) throw Error('invalid_account_token')
  return value
}
export async function accountIdentity(token:unknown,partnerId:string,deps:Pick<AccountDependencies,'rpc'>) {
  if(!token) throw Error('account_login_required')
  const result=record(await deps.rpc('commerce_app_session_context',{p_token:accountToken(token),p_partner_id:partnerId}))
  if(result.partner_id!==partnerId||typeof result.user_id!=='string') throw Error('account_login_required')
  return uuid(result.user_id)
}
export async function commerceAccount(value:unknown,deps:AccountDependencies):Promise<Row> {
  const input=record(value), partner=uuid(input.partner_id)
  if(input.action==='issue') {
    if(typeof input.access_token!=='string'||input.access_token.length>12000) throw Error('account_login_required')
    const user=await deps.verifyUser(input.access_token)
    if(!user||user.is_anonymous) throw Error('account_login_required')
    return record(await deps.rpc('commerce_issue_app_session',{p_user_id:uuid(user.id),p_partner_id:partner}))
  }
  if(input.action==='consume') return record(await deps.rpc('commerce_consume_app_ticket',{p_ticket:accountToken(input.ticket),p_partner_id:partner}))
  if(!['context','quote'].includes(String(input.action))) throw Error('invalid_account_action')
  if(input.action==='context'&&!input.session_token) return {authenticated:false,deals:[]}
  const userId=await accountIdentity(input.session_token,partner,deps)
  if(input.action==='context') {
    const context=record(await deps.rpc('commerce_deal_context',{p_partner_id:partner,p_user_id:userId}))
    const recoveryScope=createHash('sha256').update(`commerce-recovery:${partner}:${userId}`).digest('hex')
    return {...context,authenticated:true,recovery_scope:recoveryScope,...(deps.profile?{customer:await deps.profile(userId)}:{})}
  }
  if(!Array.isArray(input.items)||input.items.length>30) throw Error('invalid_cart')
  return record(await deps.rpc('commerce_deal_quote',{
    p_partner_id:partner,p_user_id:userId,p_offering_id:uuid(input.offering_id),
    p_items:input.items,p_deal_id:input.deal_id==null?null:uuid(input.deal_id),
  }))
}
