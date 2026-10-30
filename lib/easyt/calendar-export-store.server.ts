import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { getEasyTDatabase } from './database';
import { CalendarExportError } from './calendar-export-sync.ts';
import type { BindingDocument, ExportStore } from './calendar-export-sync.ts';
export const calendarExportStore: ExportStore = {
    async lock(ownerId, bindingId) {
        const sql = getEasyTDatabase(), fence = randomUUID();
        const rows = await sql `update morrovia_calendar_bindings set lease_token=${fence}::uuid, lease_until=now()+interval '60 seconds' where id=${bindingId}::uuid and owner_id=${ownerId} and (lease_until is null or lease_until<now()) returning document,version` as {
            document: BindingDocument;
            version: number;
        }[];
        if (!rows[0])
            throw new CalendarExportError('BUSY_OR_NOT_FOUND');
        return { document: { ...rows[0].document, version: rows[0].version }, fence };
    },
    async save(document, fence) {
        const sql = getEasyTDatabase(), next = { ...document, version: document.version + 1 };
        const rows = await sql `update morrovia_calendar_bindings set document=${JSON.stringify(next)}::jsonb,version=version+1,lease_until=now()+interval '60 seconds' where id=${document.id}::uuid and owner_id=${document.ownerId} and version=${document.version} and lease_token=${fence}::uuid and lease_until>now() returning version` as {
            version: number;
        }[];
        if (!rows[0])
            throw new CalendarExportError('LEASE_LOST');
        document.version = rows[0].version;
    },
    async unlock(ownerId, bindingId, fence) { const sql = getEasyTDatabase(); await sql `update morrovia_calendar_bindings set lease_token=null,lease_until=null where id=${bindingId}::uuid and owner_id=${ownerId} and lease_token=${fence}::uuid`; },
};
export async function calendarBinding(ownerId: string, tripId: string, subject: string, calendarId: string, calendarLabel: string) {
    const sql = getEasyTDatabase(), id = randomUUID();
    const document: BindingDocument = { id, ownerId, tripId, subject, calendarId, calendarLabel, namespace: randomBytes(32).toString('hex'), version: 0, items: {} };
    const rows = await sql `insert into morrovia_calendar_bindings (id,owner_id,trip_id,subject,calendar_id,document) values (${id}::uuid,${ownerId},${tripId},${subject},${calendarId},${JSON.stringify(document)}::jsonb) on conflict(owner_id,trip_id,subject,calendar_id) do update set calendar_id=excluded.calendar_id,last_used_at=now() returning document` as {
        document: BindingDocument;
    }[];
    return rows[0]!.document;
}
export async function getCalendarBinding(ownerId: string, bindingId: string, tripId: string) {
    const sql = getEasyTDatabase();
    const rows = await sql `select document from morrovia_calendar_bindings where id=${bindingId}::uuid and owner_id=${ownerId} and trip_id=${tripId}` as {
        document: BindingDocument;
    }[];
    if (!rows[0])
        throw new CalendarExportError('NOT_FOUND');
    return rows[0].document;
}
export async function listCalendarBindings(ownerId: string, tripId: string) {
    const sql = getEasyTDatabase();
    const rows = await sql `select id,subject,calendar_id,document->>'calendarLabel' as label,((document#>>'{review,idempotencyKey}') is not null or exists(select 1 from jsonb_each(coalesce(document->'items','{}'::jsonb)) entry where entry.value->>'acknowledged'='true')) as has_exports from morrovia_calendar_bindings where owner_id=${ownerId} and trip_id=${tripId} order by last_used_at desc` as {
        id: string;
        subject: string;
        calendar_id: string;
        label: string;
        has_exports: boolean;
    }[];
    return rows;
}
