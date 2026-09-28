import type { ComparisonConfig } from '../seo-comparison'

export type CollectorState = 'ok' | 'partial' | 'no_data' | 'unconfigured' | 'auth_error' | 'forbidden' | 'rate_limited' | 'timeout' | 'invalid_response' | 'provider_error' | 'blocked' | 'unsupported'
export type Observation = { state: CollectorState; source: string; method: string; observedAt: string; data: Record<string, unknown> | null; errorCode?: string }
export type CollectorTarget = { id: string; canonical_url: string; target_type: string; partner_id: string | null; city_id: string | null }
export type GoogleCredentials = { clientId: string; clientSecret: string; refreshToken: string }
export type SearchContext = Pick<ComparisonConfig,'channel'|'locale'|'location'|'device'|'latitude'|'longitude'>
export type CollectorOptions = { fetcher?: typeof fetch; clock?: () => Date }

export const now = (options?: {clock?: () => Date}) => (options?.clock?.() ?? new Date()).toISOString()
export const observation = (source:string,method:string,state:CollectorState,options?:{clock?:()=>Date},data:Record<string,unknown>|null=null,errorCode?:string):Observation => ({state,source,method,observedAt:now(options),data,...(errorCode?{errorCode}:{})})
