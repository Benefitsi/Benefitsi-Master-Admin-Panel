'use client'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export const inputClass='w-full min-w-0 rounded-lg border border-[#061829]/15 bg-white px-3 py-2.5 text-sm text-[#061829] outline-none transition focus:border-[#118cff] focus:ring-2 focus:ring-[#118cff]/15 disabled:bg-zinc-50'
export const buttonClass='inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#061829]/15 bg-white px-3 py-2 text-sm font-semibold text-[#061829] transition hover:bg-[#f3f8ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45'
export function Button({children,className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>){return <button type="button" className={`${buttonClass} ${className}`} {...props}>{children}</button>}
export function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}){return <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-[#526170]"><span>{label}</span>{children}{hint?<span className="font-normal leading-5">{hint}</span>:null}</label>}
export function Empty({title,children}:{title:string;children:ReactNode}){return <div className="px-5 py-12"><h3 className="text-xl font-bold tracking-tight">{title}</h3><div className="mt-2 max-w-lg text-sm leading-6 text-[#526170]">{children}</div></div>}
export function moveItem<T>(items:T[],index:number,direction:number){const next=[...items],to=index+direction;if(to<0||to>=items.length)return next;[next[index],next[to]]=[next[to],next[index]];return next}
