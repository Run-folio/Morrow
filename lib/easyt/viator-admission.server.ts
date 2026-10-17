import 'server-only';
import {randomUUID} from 'node:crypto';
import {getEasyTDatabase} from './database.ts';

export type ViatorAdmissionClaim = {admitted:true;token:string} | {admitted:false;retryAfterSeconds:number};
export type ViatorAdmission = {
  claim(): Promise<ViatorAdmissionClaim>;
  release(token:string): Promise<void>;
  cooldown(seconds:number): Promise<void>;
};

/** All instances of an app origin and provider environment share one SQL row.
 * The migration is deliberately never applied by the request path. Missing
 * configuration/schema/database means no successful claim and no upstream call.
 */
export function createViatorAdmission(providerEnvironment:string): ViatorAdmission {
  const scope = () => {
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? '').origin;
    return `${origin}|${providerEnvironment}`;
  };
  return {
    async claim() {
      const token=randomUUID();
      const sql=getEasyTDatabase();
      const rows=await sql`select admitted, retry_after_seconds from morrovia_viator_claim(${scope()}, ${token}::uuid)`;
      if (rows[0]?.admitted === true) return {admitted:true,token};
      if (rows[0]?.admitted === false && Number.isFinite(Number(rows[0].retry_after_seconds))) {
        return {admitted:false,retryAfterSeconds:Math.max(1,Math.min(86_400,Math.ceil(Number(rows[0].retry_after_seconds))))};
      }
      throw new Error('Activity admission unavailable.');
    },
    async release(token) {
      const sql=getEasyTDatabase();
      await sql`update morrovia_viator_budget set leases=leases - ${token} where scope=${scope()}`;
    },
    async cooldown(seconds) {
      const bounded=Number.isFinite(seconds) ? Math.max(1,Math.ceil(seconds)) : Number.MAX_SAFE_INTEGER;
      const sql=getEasyTDatabase();
      await sql`update morrovia_viator_budget set cooldown_until=greatest(cooldown_until,case when ${bounded}::numeric>31536000 then 'infinity'::timestamptz else clock_timestamp()+${bounded}*interval '1 second' end) where scope=${scope()}`;
    },
  };
}

export function viatorRetryAfter(value:string|null, now=Date.now()):number {
  if (value && /^\d+$/.test(value.trim())) {
    const seconds=Number(value.trim());
    return Number.isSafeInteger(seconds) ? Math.max(1,seconds) : Number.MAX_SAFE_INTEGER;
  }
  const seconds=value ? (Date.parse(value)-now)/1000 : NaN;
  return Number.isFinite(seconds) ? Math.max(1,Math.ceil(seconds)) : 60;
}
