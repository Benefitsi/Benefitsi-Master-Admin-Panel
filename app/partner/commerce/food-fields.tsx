'use client'

import { useState } from 'react'
import { CommerceImageField } from './image-field'
type Entry=Record<string,unknown>
type NumberInput=number|''
type Variant={id:string;title:string;unit_amount:NumberInput;default?:boolean}
type OptionGroup={id:string;title:string;min:NumberInput;max:NumberInput;options:Variant[]}
type Ingredient={id:string;title:string;removable:boolean}
type Zone={postal_codes_text?:string;id:string;label:string;postal_codes:string[];minimum_order_amount:NumberInput;delivery_fee:NumberInput;free_delivery_from?:number}
const field='mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm'
const button='rounded-lg border px-3 py-2 text-sm font-semibold'
function NumberField({label,value,onChange,min=0,max=10000000}:{label:string;value:NumberInput;onChange:(value:NumberInput)=>void;min?:number;max?:number}) {
  return <label className="text-sm">{label}<input className={field} type="number" required min={min} max={max} step={1} value={value} onChange={e=>onChange(e.target.value===''?'':Number(e.target.value))}/></label>
}
function TextField({label,value,onChange,max=120}:{label:string;value:string;onChange:(value:string)=>void;max?:number}) {
  return <label className="text-sm">{label}<input className={field} required maxLength={max} value={value} onChange={e=>onChange(e.target.value)}/></label>
}
export function FoodMenuFields({entry,imageOrigin}:{entry:Entry;imageOrigin:string}) {
  const [variants,setVariants]=useState<Variant[]>(Array.isArray(entry.variants)?entry.variants:[])
  const [groups,setGroups]=useState<OptionGroup[]>(Array.isArray(entry.option_groups)?entry.option_groups:[])
  const [ingredients,setIngredients]=useState<Ingredient[]>(Array.isArray(entry.ingredients)?entry.ingredients:[])
  return <div className="space-y-4 sm:col-span-3">
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Kategorie<input name="category" className={field} maxLength={120} defaultValue={String(entry.category||'')} placeholder="Pizza"/></label><CommerceImageField name="image_url" label="Bild zum Gericht" value={String(entry.image_url||'')} imageOrigin={imageOrigin}/></div>
    <fieldset className="space-y-3 rounded-xl border p-3"><legend className="px-1 font-semibold">Größen / Varianten</legend><p className="text-sm text-slate-600">Der Preis einer Variante ersetzt den Grundpreis. Wenn Varianten angelegt sind, muss der Gast eine auswählen. Vorauswahl ist optional.</p><input type="hidden" name="variants" value={JSON.stringify(variants)}/>
      {variants.map((v,i)=><div key={i} className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4"><TextField label="ID (eindeutig)" value={v.id} max={80} onChange={id=>setVariants(a=>a.map((x,j)=>j===i?{...x,id}:x))}/><TextField label="Größe / Name" value={v.title} onChange={title=>setVariants(a=>a.map((x,j)=>j===i?{...x,title}:x))}/><NumberField label="Gesamtpreis in Cent" value={v.unit_amount} onChange={unit_amount=>setVariants(a=>a.map((x,j)=>j===i?{...x,unit_amount}:x))}/><div className="flex flex-wrap items-center gap-2"><label className="text-sm"><input type="checkbox" checked={!!v.default} onChange={e=>setVariants(a=>a.map((x,j)=>({...x,default:j===i?e.target.checked:false})))}/> Vorauswahl</label><button className={button} type="button" aria-label={`Variante ${v.title||i+1} entfernen`} onClick={()=>setVariants(a=>a.filter((_,j)=>i!==j))}>Entfernen</button></div></div>)}
      <button className={button} type="button" disabled={variants.length>=30} onClick={()=>setVariants(a=>[...a,{id:`variante-${crypto.randomUUID().slice(0,8)}`,title:'',unit_amount:Number(entry.unit_amount)||0}])}>Variante hinzufügen</button>
    </fieldset>
    <fieldset className="space-y-3 rounded-xl border p-3"><legend className="px-1 font-semibold">Zutaten und Abwahl</legend><input type="hidden" name="ingredients" value={JSON.stringify(ingredients)}/>
      {ingredients.map((v,i)=><div key={i} className="grid gap-3 sm:grid-cols-3"><TextField label="ID (eindeutig)" value={v.id} max={80} onChange={id=>setIngredients(a=>a.map((x,j)=>j===i?{...x,id}:x))}/><TextField label="Zutat" value={v.title} onChange={title=>setIngredients(a=>a.map((x,j)=>j===i?{...x,title}:x))}/><div className="flex flex-wrap items-center gap-2"><label className="text-sm"><input type="checkbox" checked={v.removable} onChange={e=>setIngredients(a=>a.map((x,j)=>j===i?{...x,removable:e.target.checked}:x))}/> Gast darf abwählen</label><button className={button} type="button" aria-label={`Zutat ${v.title||i+1} entfernen`} onClick={()=>setIngredients(a=>a.filter((_,j)=>i!==j))}>Entfernen</button></div></div>)}
      <button className={button} type="button" disabled={ingredients.length>=50} onClick={()=>setIngredients(a=>[...a,{id:`zutat-${crypto.randomUUID().slice(0,8)}`,title:'',removable:true}])}>Zutat hinzufügen</button>
    </fieldset>
    <fieldset className="space-y-4 rounded-xl border p-3">
      <legend className="px-1 font-semibold">Auswahlgruppen und Extras</legend>
      <p className="text-sm text-slate-600">Zum Beispiel „Teig“ mit genau einer Auswahl oder „Extra-Zutaten“ mit bis zu drei Ergänzungen. Aufpreise werden zum Gerichtspreis addiert. Die Vorauswahl kann der Gast ändern.</p>
      <input type="hidden" name="option_groups" value={JSON.stringify(groups)}/>
      {!groups.length&&<p className="text-sm text-slate-500">Noch keine Auswahlgruppen. Lege eine Gruppe an, wenn Gäste zwischen Zubereitungen oder Extras wählen können.</p>}
      {groups.map((group,index)=>{
        const change=(update:Partial<OptionGroup>)=>setGroups(rows=>rows.map((row,i)=>i===index?{...row,...update}:row))
        const updateOption=(optionIndex:number,update:Partial<Variant>)=>change({options:group.options.map((option,i)=>i===optionIndex?{...option,...update}:option)})
        const defaults=group.options.filter(option=>option.default).length
        const max=Number(group.max)
        return <fieldset key={group.id} className="space-y-3 rounded-xl border bg-slate-50 p-3">
          <legend className="px-1 font-semibold">{group.title||`Auswahlgruppe ${index+1}`}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField label="Name der Auswahlgruppe" value={group.title} onChange={title=>change({title})}/>
            <NumberField label="Mindestens auswählen" value={group.min} max={max} onChange={min=>change({min})}/>
            <NumberField label="Höchstens auswählen" value={group.max} min={Number(group.min)} max={group.options.length} onChange={max=>change({max})}/>
          </div>
          <p className="text-xs text-slate-600">Mindestens 0: freiwillig. Mindestens 1: eine Auswahl ist Pflicht. Die Höchstzahl darf die Anzahl der Optionen nicht übersteigen.</p>
          {defaults>max&&<p role="alert" className="text-sm text-rose-700">Es sind {defaults} Optionen vorausgewählt. Bitte die Vorauswahl auf höchstens {max} reduzieren oder die Höchstzahl erhöhen.</p>}
          {group.options.map((option,optionIndex)=><div key={option.id} className="grid items-end gap-3 rounded-lg border bg-white p-3 sm:grid-cols-3">
            <TextField label={`Option ${optionIndex+1}: Name`} value={option.title} onChange={title=>updateOption(optionIndex,{title})}/>
            <NumberField label={`Option ${optionIndex+1}: Aufpreis in Cent`} value={option.unit_amount} onChange={unit_amount=>updateOption(optionIndex,{unit_amount})}/>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm"><input type="checkbox" checked={!!option.default} disabled={!option.default&&defaults>=max} onChange={e=>updateOption(optionIndex,{default:e.target.checked})} aria-label={`${option.title||`Option ${optionIndex+1}`} vorauswählen`}/> Vorauswahl</label>
              <button type="button" className={button} disabled={group.options.length===1} aria-label={`${option.title||`Option ${optionIndex+1}`} aus ${group.title||`Gruppe ${index+1}`} entfernen`} onClick={()=>{
                const options=group.options.filter((_,i)=>i!==optionIndex)
                const nextMax=Math.min(max,options.length)
                change({options,max:nextMax,min:Math.min(Number(group.min),nextMax)})
              }}>Option entfernen</button>
            </div>
          </div>)}
          <p className="text-xs text-slate-600">100 Cent = 1 €. Für Optionen ohne Aufpreis 0 eintragen. Jede Gruppe benötigt mindestens eine Option.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={group.options.length>=30} aria-label={`Option zu ${group.title||`Gruppe ${index+1}`} hinzufügen`} onClick={()=>change({options:[...group.options,{id:`option-${crypto.randomUUID().slice(0,8)}`,title:'',unit_amount:0}]})}>Option hinzufügen</button>
            <button type="button" className={button} aria-label={`Auswahlgruppe ${group.title||index+1} entfernen`} onClick={()=>setGroups(rows=>rows.filter((_,i)=>i!==index))}>Gruppe entfernen</button>
          </div>
        </fieldset>
      })}
      <button type="button" className={button} disabled={groups.length>=20} onClick={()=>setGroups(rows=>[...rows,{id:`gruppe-${crypto.randomUUID().slice(0,8)}`,title:'',min:0,max:1,options:[{id:`option-${crypto.randomUUID().slice(0,8)}`,title:'',unit_amount:0}]}])}>Auswahlgruppe hinzufügen</button>
    </fieldset>
  </div>
}
export function FoodFulfillmentFields({entry}:{entry:Entry}) {
  const [zones,setZones]=useState<Zone[]>(Array.isArray(entry.delivery_zones)?entry.delivery_zones.map(z=>({...z,postal_codes_text:z.postal_codes.join(', ')})):[])
  const modes=Array.isArray(entry.fulfillment_modes)?entry.fulfillment_modes:['pickup']
  return <fieldset className="space-y-3 rounded-xl border p-3 sm:col-span-3"><legend className="px-1 font-semibold">Abholung und eigene Lieferung (nur Essen)</legend><p className="text-sm text-slate-600">Lieferung ist standardmäßig aus. Bei aktivierter Lieferung übernimmt der Betrieb die Zustellung. Postleitzahlen dürfen nur in einem Gebiet vorkommen; der Mindestwert gilt für den Warenkorb ohne Liefergebühr.</p><div className="flex flex-wrap gap-4"><label><input name="fulfillment_modes" type="checkbox" value="pickup" defaultChecked={modes.includes('pickup')}/> Abholung</label><label><input name="fulfillment_modes" type="checkbox" value="delivery" defaultChecked={modes.includes('delivery')}/> Eigene Lieferung aktivieren</label></div><label className="block text-sm">Abholadresse<input name="pickup_address" className={field} maxLength={500} defaultValue={String(entry.pickup_address||'')}/></label><input type="hidden" name="delivery_zones" value={JSON.stringify(zones.map(z=>({id:z.id,label:z.label,postal_codes:z.postal_codes,minimum_order_amount:z.minimum_order_amount,delivery_fee:z.delivery_fee,...(z.free_delivery_from===undefined?{}:{free_delivery_from:z.free_delivery_from})})))}/>
    {zones.map((z,i)=>{const change=(update:Partial<Zone>)=>setZones(a=>a.map((x,j)=>j===i?{...x,...update}:x));return <div key={i} className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-3"><TextField label="Gebiets-ID" value={z.id} max={80} onChange={id=>change({id})}/><TextField label="Gebietsname" value={z.label} onChange={label=>change({label})}/><label className="text-sm">Postleitzahlen (mit Komma)<input className={field} required value={z.postal_codes_text??''} onChange={e=>change({postal_codes_text:e.target.value,postal_codes:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})} placeholder="10115, 10117"/></label><NumberField label="Mindestbestellwert in Cent" value={z.minimum_order_amount} max={100000000} onChange={minimum_order_amount=>change({minimum_order_amount})}/><NumberField label="Liefergebühr in Cent" value={z.delivery_fee} onChange={delivery_fee=>change({delivery_fee})}/><label className="text-sm">Kostenlos ab Cent (optional)<input className={field} type="number" min={0} max={100000000} step={1} value={z.free_delivery_from??''} onChange={e=>change({free_delivery_from:e.target.value===''?undefined:Number(e.target.value)})}/></label><button className={button} type="button" aria-label={`Liefergebiet ${z.label||i+1} entfernen`} onClick={()=>setZones(a=>a.filter((_,j)=>j!==i))}>Liefergebiet entfernen</button></div>})}
    <button className={button} type="button" disabled={zones.length>=30} onClick={()=>setZones(a=>[...a,{id:`gebiet-${crypto.randomUUID().slice(0,8)}`,label:'',postal_codes:[],minimum_order_amount:0,delivery_fee:0}])}>Liefergebiet hinzufügen</button>
  </fieldset>
}
