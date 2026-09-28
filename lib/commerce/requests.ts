import { commerceImageUrl } from './images.ts'
/** Boundary validation. Prices, account IDs and ownership are always read server-side. */
export type Row = Record<string, unknown>
export function record(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_request')
  return value as Row
}
export function uuid(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error('invalid_id')
  return value
}
function text(value: unknown, max: number, min = 0) {
  if (value == null && min === 0) return ''
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new Error('invalid_text')
  return value.trim()
}
function integer(value: unknown, min: number, max: number) {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < min || n > max) throw new Error('invalid_number')
  return n
}
function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) throw new Error('invalid_choice')
  return value as T
}
function list(value: unknown, max: number): unknown[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > max) throw new Error('invalid_list')
  return value
}
function unique<T>(values: T[], key: (value:T)=>string): T[] {
  if(new Set(values.map(key)).size!==values.length) throw new Error('duplicate_ids')
  return values
}
function boolean(value: unknown) {
  if(typeof value!=='boolean') throw new Error('invalid_boolean')
  return value
}
function pricedOptions(value:unknown, max=30) {
  return unique(list(value,max).map(value=>{
    const r=record(value)
    return {id:text(r.id,80,1),title:text(r.title,120,1),unit_amount:integer(r.unit_amount,0,10000000),...(r.default===undefined?{}:{default:boolean(r.default)})}
  }),r=>r.id)
}
function menuConfiguration(v:Row) {
  const variants=pricedOptions(v.variants)
  if(variants.filter(v=>v.default).length>1) throw new Error('invalid_defaults')
  const option_groups=unique(list(v.option_groups,20).map(value=>{
    const g=record(value),options=pricedOptions(g.options),min=integer(g.min,0,30),max=integer(g.max,0,30)
    if(!options.length||min>max||max>options.length||options.filter(o=>o.default).length>max) throw new Error('invalid_group_limits')
    return {id:text(g.id,80,1),title:text(g.title,120,1),min,max,options}
  }),g=>g.id)
  const ingredients=unique(list(v.ingredients,50).map(value=>{const r=record(value);return {id:text(r.id,80,1),title:text(r.title,120,1),removable:boolean(r.removable)}}),r=>r.id)
  return {category:text(v.category,120),image_url:commerceImageUrl(v.image_url),variants,option_groups,ingredients}
}
function fulfillmentConfiguration(v:Row,kind:string) {
  const modes=unique(list(v.fulfillment_modes??['pickup'],2).map(m=>choice(m,['pickup','delivery'] as const)),m=>m)
  if(!modes.length) throw new Error('invalid_fulfillment_modes')
  const postcodes=new Set<string>()
  const zones=unique(list(v.delivery_zones,30).map(value=>{
    const z=record(value),postal_codes=list(z.postal_codes,200).map(value=>{
      const code=text(value,5,5)
      if(!/^\d{5}$/.test(code)||postcodes.has(code)) throw new Error('invalid_delivery_postcodes')
      postcodes.add(code);return code
    })
    if(!postal_codes.length) throw new Error('invalid_delivery_postcodes')
    return {id:text(z.id,80,1),label:text(z.label,120,1),postal_codes,minimum_order_amount:integer(z.minimum_order_amount,0,100000000),delivery_fee:integer(z.delivery_fee,0,10000000),...(z.free_delivery_from==null?{}:{free_delivery_from:integer(z.free_delivery_from,0,100000000)})}
  }),z=>z.id)
  if((kind!=='food_pickup'&&(modes.includes('delivery')||zones.length))||(modes.includes('delivery')&&!zones.length)) throw new Error('invalid_delivery_configuration')
  return {fulfillment_modes:modes,pickup_address:text(v.pickup_address,500),delivery_zones:zones}
}
export function parseBookingRequest(value: unknown) {
  const v = record(value), customer = record(v.customer)
  const email = text(customer.email,254,3).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('invalid_email')
  if (!Array.isArray(v.items) || v.items.length > 50) throw new Error('invalid_cart')
  const mode=choice(v.fulfillment_mode??'pickup',['pickup','delivery'] as const)
  let address:Row|undefined
  if(mode==='delivery') {
    const a=record(v.delivery_address),postal_code=text(a.postal_code,5,5)
    if(!/^\d{5}$/.test(postal_code)) throw new Error('invalid_postal_code')
    address={street:text(a.street,200,3),postal_code,city:text(a.city,120,2),details:text(a.details,500)}
  } else if(v.delivery_address!=null) throw new Error('delivery_address_not_allowed')
  return {
    ...(v.fulfillment_mode===undefined?{}:{fulfillment_mode:mode}),...(address?{delivery_address:address}:{}),
    partner_id: uuid(v.partner_id), offering_id:uuid(v.offering_id), slot_id:uuid(v.slot_id),
    quantity:integer(v.quantity ?? 1,1,100),
    items:v.items.map(item=>{
      const row=record(item)
      if (!Array.isArray(row.extra_ids) || row.extra_ids.length>20) throw new Error('invalid_extras')
      const extras=row.extra_ids.map(id=>text(id,80,1))
      if(new Set(extras).size!==extras.length) throw new Error('duplicate_extras')
      const options=unique(list(row.option_ids,100).map(value=>{const o=record(value);return {group_id:text(o.group_id,80,1),option_id:text(o.option_id,80,1)}}),o=>JSON.stringify([o.group_id,o.option_id]))
      const removed=unique(list(row.removed_ingredient_ids,50).map(id=>text(id,80,1)),id=>id)
      return {menu_item_id:uuid(row.menu_item_id),quantity:integer(row.quantity,1,50),extra_ids:extras,
        ...(row.variant_id==null?{}:{variant_id:text(row.variant_id,80,1)}),
        ...(row.option_ids===undefined?{}:{option_ids:options}),...(row.removed_ingredient_ids===undefined?{}:{removed_ingredient_ids:removed}),...(row.note===undefined?{}:{note:text(row.note,500)})}

    }),
    customer:{name:text(customer.name,120,2),email,phone:text(customer.phone,40),notes:text(customer.notes,1000)},
    payment_method:choice(v.payment_method,['pay_on_site','online'] as const),
    idempotency_key:text(v.idempotency_key,200,16),
  }
}
export function parseGuestAccess(value: unknown) {
  const v=record(value), reference=text(v.reference,40,6), token=text(v.token,128,32)
  if(!/^[A-Za-z0-9_-]+$/.test(reference)|| !/^[a-f0-9]{64}$/i.test(token)) throw new Error('invalid_access')
  return {reference,token}
}
export function safeBookingResult(value: unknown) {
  const v=record(value), source=record(v.booking), booking:Row={}
  for(const key of ['id','public_reference','public_token','provider_id','offering_id','kind','state','payment_method','payment_state','total_amount','currency','slot_id','starts_at','ends_at','hold_expires_at','quantity','title','cancellation_policy','customer_payment_notice','items','fulfillment_mode','delivery_address','pickup_address','subtotal_amount','delivery_fee']) {
    if(source[key]!==undefined) booking[key]=source[key]
  }
  return {ok:true,replayed:v.replayed===true,booking}
}
const kinds=['food_pickup','table','appointment'] as const
export function parseConfiguration(value: unknown): {entity:string;providerId:string;data:Row} {
  const v=record(value),providerId=uuid(v.provider_id),entity=choice(v.entity,['resource','offering','menu','slot'] as const)
  let data:Row={provider_id:providerId}
  if(entity==='resource') data={...data,kind:choice(v.kind,kinds),name:text(v.name,120,2),capacity:integer(v.capacity,1,100),active:true}
  if(entity==='offering') {
    const kind=choice(v.kind,kinds)
    const modes=Array.isArray(v.payment_modes)?v.payment_modes:[]
    if(modes.length<1||modes.length>2||new Set(modes).size!==modes.length) throw new Error('invalid_payment_modes')
    data={...data,...fulfillmentConfiguration(v,kind),kind,title:text(v.title,160,3),description:text(v.description,3000),currency:'eur',unit_amount:integer(v.unit_amount,0,10000000),duration_minutes:integer(v.duration_minutes,1,1440),buffer_minutes:integer(v.buffer_minutes??0,0,240),payment_modes:modes.map(m=>choice(m,['pay_on_site','online'] as const)),cancellation_policy:text(v.cancellation_policy,3000),customer_payment_notice:text(v.customer_payment_notice,2000),active:false}
    data.lead_time_minutes=integer(v.lead_time_minutes??0,0,10080)
    data.hero_image_url=commerceImageUrl(v.hero_image_url)
  }
  if(entity==='menu') {
    const extras=Array.isArray(v.extras)?v.extras:[]
    if(extras.length>20) throw new Error('invalid_extras')
    const mapped=extras.map(extra=>{const e=record(extra);return {id:text(e.id,80,1),title:text(e.title,120,1),unit_amount:integer(e.unit_amount,0,100000)}})
    if(new Set(mapped.map(e=>e.id)).size!==mapped.length) throw new Error('duplicate_extras')
    data={...data,...menuConfiguration(v),offering_id:uuid(v.offering_id),title:text(v.title,160,2),description:text(v.description,2000),unit_amount:integer(v.unit_amount,1,10000000),extras:mapped,active:true}
  }
  if(entity==='slot') {
    const start=text(v.starts_at,40,10),end=text(v.ends_at,40,10)
    if(!/(Z|[+-]\d\d:\d\d)$/.test(start)||!/(Z|[+-]\d\d:\d\d)$/.test(end)) throw new Error('timezone_required')
    const from=Date.parse(start),to=Date.parse(end)
    if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>86400000) throw new Error('invalid_time')
    data={...data,offering_id:uuid(v.offering_id),resource_id:uuid(v.resource_id),starts_at:new Date(from).toISOString(),ends_at:new Date(to).toISOString(),capacity:integer(v.capacity,1,100),active:true}
  }
  return {entity,providerId,data}
}

/** Decode partner form transport, then use parseConfiguration for all authorization-bound values. */
export function configurationFormInput(form:FormData):Row {
  const input:Row=Object.fromEntries(form.entries())
  const value=(name:string)=>String(form.get(name)||'')
  if(input.entity==='offering') {
    input.payment_modes=form.getAll('payment_modes')
    input.fulfillment_modes=form.getAll('fulfillment_modes')
    input.delivery_zones=JSON.parse(value('delivery_zones')||'[]')
  }
  if(input.entity==='menu') {
    for(const key of ['variants','option_groups','ingredients']) input[key]=JSON.parse(value(key)||'[]')
    input.extras=Array.from({length:20},(_,i)=>i).flatMap(i=>{
      const title=value(`extra_title_${i}`).trim()
      return title?[{id:value(`extra_id_${i}`)||`extra-${i+1}`,title,unit_amount:Number(value(`extra_price_${i}`)||0)}]:[]
    })
  }
  return input
}
