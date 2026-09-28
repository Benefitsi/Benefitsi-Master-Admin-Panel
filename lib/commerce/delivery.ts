export type Notification = {id:string;lease_token:string;payload:unknown;provider_id?:string;booking_id?:string;event_key?:string}
/** The receiver must deduplicate by message ID: network delivery is at least once. */
export async function deliverNotifications(messages:Notification[],deliver:(message:Notification)=>Promise<void>,finish:(id:string,success:boolean,lease:string,error:string|null)=>Promise<unknown>) {
  let sent=0,failed=0
  for(const message of messages) {
    let success=true
    try {await deliver(message)}catch {success=false}
    await finish(message.id,success,message.lease_token,success?null:'delivery_failed')
    if(success)sent++;else failed++
  }
  return {sent,failed}
}
