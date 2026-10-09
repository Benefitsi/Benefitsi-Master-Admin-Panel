'use client'
import { ArrowUp, ArrowDown, Plus, Trash } from '@phosphor-icons/react'
import { translateValue, useAdminLocale } from '@/app/admin-language'
import { type Block, newId } from '@/lib/workspace/model'
import { Button, inputClass, moveItem } from './ui'

const blockNames={paragraph:'Text',heading:'Überschrift',bullet:'Aufzählung',number:'Nummerierte Liste',todo:'Checkliste',callout:'Hinweis'} as const
export function BlockEditor({blocks,onChange}:{blocks:Block[];onChange:(blocks:Block[])=>void}) {
  const language = useAdminLocale() === 'de-DE' ? 'de' : 'en'
  const add=(index=blocks.length)=>{const next=[...blocks];next.splice(index,0,{id:newId(),type:'paragraph',text:'',checked:false});onChange(next)}
  const patch=(id:string,changes:Partial<Block>)=>onChange(blocks.map(b=>b.id===id?{...b,...changes}:b))
  return <div className="space-y-4">
    {blocks.length===0?<p className="py-5 text-sm text-[#526170]">Gedanken, Beobachtungen und wichtige Details haben hier Platz.</p>:null}
    {blocks.map((block,index)=><div key={block.id} className={`group rounded-xl ${block.type==='callout'?'border-l-4 border-[#118cff] bg-[#f3f8ff] p-4':'py-1'}`}>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <select aria-label={`Blocktyp ${index+1}`} value={block.type} onChange={e=>patch(block.id,{type:e.target.value as Block['type']})} className="mr-auto rounded-md border border-transparent bg-transparent px-1 py-1 text-xs text-[#526170] focus:border-[#118cff]">{Object.entries(blockNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        <Button aria-label={`Block ${index+1} nach oben`} disabled={index===0} onClick={()=>onChange(moveItem(blocks,index,-1))}><ArrowUp size={14}/></Button>
        <Button aria-label={`Block ${index+1} nach unten`} disabled={index===blocks.length-1} onClick={()=>onChange(moveItem(blocks,index,1))}><ArrowDown size={14}/></Button>
        <Button aria-label={`Block ${index+1} entfernen`} onClick={()=>{if(!block.text||window.confirm(translateValue('Diesen Block entfernen?', language)))onChange(blocks.filter(b=>b.id!==block.id))}}><Trash size={14}/></Button>
      </div>
      <div className="flex items-start gap-3">
        {block.type==='todo'?<input aria-label={`Checkliste ${index+1} erledigt`} type="checkbox" checked={block.checked} onChange={e=>patch(block.id,{checked:e.target.checked})} className="mt-3 size-5 accent-[#118cff]"/>:null}
        {block.type==='bullet'||block.type==='number'?<span aria-hidden className="pt-3 text-[#526170]">{block.type==='bullet'?'•':`${index+1}.`}</span>:null}
        <textarea aria-label={`Inhalt Block ${index+1}`} value={block.text} maxLength={20000} onChange={e=>patch(block.id,{text:e.target.value})} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();add(index+1)}}} placeholder={block.type==='heading'?'Überschrift':'Hier schreiben …'} rows={block.type==='heading'?2:Math.min(12,Math.max(3,block.text.split('\n').length+1))} className={`${inputClass} resize-y border-transparent bg-transparent ${block.type==='heading'?'text-xl font-bold':'leading-7'} ${block.checked&&block.type==='todo'?'text-zinc-400 line-through':''}`} />
      </div>
    </div>)}
    <Button onClick={()=>add()} disabled={blocks.length>=500}><Plus size={16}/>Textblock hinzufügen</Button>
    <p className="text-xs text-[#697680]">Strg/⌘ + Enter fügt einen Block hinzu. Änderungen werden automatisch gespeichert.</p>
  </div>
}
