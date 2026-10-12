import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import type { EasyTTrip } from '../../lib/easyt/trip.ts';
import type { EasyTBrowserStorage } from '../../lib/easyt/storage.ts';

type Query = { text: string; values: unknown[] };
type Row = { ownerId: string; document: EasyTTrip; deletedAt: string | null };
const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const build = (parts: TemplateStringsArray, values: unknown[]): Query => ({
  text: parts.reduce((text, part, index) => text + (index ? '$' + index : '') + part, '').replace(/\s+/g, ' ').trim(), values,
});
const bound = (query: Query, pattern: RegExp): unknown => {
  const match = query.text.match(pattern); assert.ok(match, 'Required actual SQL predicate missing: ' + pattern);
  return query.values[Number(match[1]) - 1];
};
const defer = () => {
  let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve };
};

/** A finite SQL contract model. It never loads a database driver or credentials.
 * Unsupported SQL fails closed; child tables are counted, not implemented. */
export const accountSql = {
  ownerId: 'owner-a', rows: new Map<string, Row>(), queries: [] as Query[],
  acceptedWrites: 0, rejectedWrites: 0, appliedProjectionStatements: 0, blockedProjectionStatements: 0,
  queue: Promise.resolve() as Promise<unknown>,
  pause: null as null | { entered: ReturnType<typeof defer>; released: ReturnType<typeof defer> },
  reset() {
    this.ownerId = 'owner-a'; this.rows.clear(); this.queries = []; this.acceptedWrites = 0; this.rejectedWrites = 0;
    this.appliedProjectionStatements = 0; this.blockedProjectionStatements = 0; this.queue = Promise.resolve(); this.pause = null;
  },
  holdNextTransaction() {
    assert.equal(this.pause, null); const entered = defer(), released = defer(); this.pause = { entered, released };
    return { entered: entered.promise, release: released.resolve };
  },
  snapshot() { return wire([...this.rows]); },
};

function select(query: Query) {
  accountSql.queries.push(query);
  assert.match(query.text, /^select .* from easyt_trips where id = \$\d+/);
  const row = accountSql.rows.get(String(bound(query, /where id = \$(\d+)/)));
  if (!row) return [];
  if (query.text.includes('and owner_id =')) {
    const ownerId = bound(query, /and owner_id = \$(\d+)/);
    assert.match(query.text, /and deleted_at is null/);
    return row.ownerId === ownerId && row.deletedAt === null ? [{ document: wire(row.document) }] : [];
  }
  if (query.text.includes(' as matches')) {
    const candidate = JSON.parse(String(bound(query, /document = \$(\d+)::jsonb as matches/)));
    return [{ owner_id: row.ownerId, deleted_at: row.deletedAt, document: wire(row.document), matches: isDeepStrictEqual(wire(candidate), wire(row.document)) }];
  }
  assert.match(query.text, /owner_id as "ownerId", deleted_at as "deletedAt", document/);
  return [{ ownerId: row.ownerId, deletedAt: row.deletedAt, document: wire(row.document) }];
}

function executeTransaction(queries: Query[]) {
  let candidate: EasyTTrip | null = null, operation: 'save' | 'promotion' | null = null, won = false;
  return queries.map(query => {
    accountSql.queries.push(query);
    if (query.text.startsWith('select pg_advisory_xact_lock')) return [];
    if (query.text.startsWith('select set_config')) {
      operation = query.text.includes('morrovia.save_document') ? 'save' : 'promotion';
      assert.match(query.text, new RegExp("morrovia\\." + operation + "_won', 'false', true"));
      candidate = JSON.parse(String(query.values[0])); return [];
    }
    assert.ok(candidate); assert.ok(operation);
    if (query.text.startsWith('with saved as')) {
      assert.equal(operation, 'save'); assert.match(query.text, /and deleted_at is null/); assert.match(query.text, /and schema_version <= 2/);
      assert.match(query.text, /set_config\('morrovia.save_document', document::text, true\)/);
      const id = String(bound(query, /where id = \$(\d+)/)), row = accountSql.rows.get(id);
      const ownerId = bound(query, /and owner_id = \$(\d+)/), revision = bound(query, /and document ->> 'updatedAt' = \$(\d+)/);
      const sourceVersion = Number(bound(query, /schema_version < 2 or \$(\d+) >= 2/));
      assert.equal(id, candidate.id);
      won = Boolean(row && row.ownerId === ownerId && row.deletedAt === null && row.document.updatedAt === revision
        && (row.document.schemaVersion < 2 || sourceVersion >= 2) && row.document.schemaVersion <= 2);
      if (!won) { accountSql.rejectedWrites++; return []; }
      const document = wire(candidate);
      if (row!.document.status === 'planned' && document.status === 'draft') document.status = 'planned';
      accountSql.rows.set(id, { ownerId: String(ownerId), document, deletedAt: null }); accountSql.acceptedWrites++;
      return [{ document: wire(document) }];
    }
    if (query.text.startsWith('with inserted as')) {
      assert.equal(operation, 'promotion'); assert.match(query.text, /on conflict \(id\) do nothing/);
      const id = String(query.values[0]), ownerId = String(query.values[1]); assert.equal(id, candidate.id); assert.equal(ownerId, candidate.ownerId);
      won = !accountSql.rows.has(id);
      if (!won) { accountSql.rejectedWrites++; return []; }
      accountSql.rows.set(id, { ownerId, document: wire(candidate), deletedAt: null }); accountSql.acceptedWrites++;
      return [{ id }];
    }
    assert.match(query.text, /^(delete from|insert into) easyt_(recommendations|plan_items|legs|stops)/);
    assert.match(query.text, new RegExp("current_setting\\('morrovia\\." + operation + "_won', true\\) = 'true'"));
    assert.match(query.text, new RegExp("document = current_setting\\('morrovia\\." + operation + "_document'\\)::jsonb"));
    assert.match(query.text, /owner_id = \$\d+.*deleted_at is null/);
    if (won) accountSql.appliedProjectionStatements++; else accountSql.blockedProjectionStatements++;
    return [];
  });
}

export function getEasyTDatabase() {
  const query = async (parts: TemplateStringsArray, ...values: unknown[]) => select(build(parts, values));
  return Object.assign(query, { transaction: async (callback: (tx: (parts: TemplateStringsArray, ...values: unknown[]) => Query) => Query[]) => {
    const queries = callback((parts, ...values) => build(parts, values));
    const hold = accountSql.pause; accountSql.pause = null;
    if (hold) { hold.entered.resolve(); await hold.released.promise; }
    const pending = accountSql.queue.then(() => executeTransaction(queries));
    accountSql.queue = pending.catch(() => undefined); return pending;
  } });
}
export async function requireEasyTOwner() { return { id: accountSql.ownerId }; }

/** No browser globals: every storage read/write is to this fresh map. */
export class SyntheticAccountStorage implements EasyTBrowserStorage {
  values = new Map<string, string>(); setterCalls = 0; removals = 0;
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.setterCalls++; this.values.set(key, value); }
  removeItem(key: string) { this.removals++; this.values.delete(key); }
}
