import "server-only";

import { randomUUID } from "node:crypto";
import { getEasyTDatabase } from "./database";

export type EasyTRouteControl = {
  routeKey: string;
  published: boolean;
  featured: boolean;
  featuredOrder: number | null;
  updatedAt: string;
  updatedBy: string | null;
};

export async function listEasyTRouteControls() {
  const sql = getEasyTDatabase();
  return (await sql`
    select route_key as "routeKey", published, featured, featured_order as "featuredOrder",
      updated_at as "updatedAt", updated_by as "updatedBy"
    from easyt_route_controls
  `) as EasyTRouteControl[];
}

export async function updateEasyTRouteControl(input: {
  routeKey: string;
  published: boolean;
  featured: boolean;
  updatedBy: string;
}) {
  const sql = getEasyTDatabase();
  const [row] = (await sql`
    insert into easyt_route_controls (route_key, published, featured, featured_order, updated_by)
    values (${input.routeKey}, ${input.published}, ${input.featured},
      case when ${input.featured} then 1 else null end,
      ${input.updatedBy})
    on conflict (route_key) do update set
      published = excluded.published,
      featured = excluded.featured,
      featured_order = case when excluded.featured then coalesce(easyt_route_controls.featured_order, 1) else null end,
      updated_by = excluded.updated_by,
      updated_at = now()
    returning route_key as "routeKey", published, featured, featured_order as "featuredOrder",
      updated_at as "updatedAt", updated_by as "updatedBy"
  `) as EasyTRouteControl[];
  await sql`
    insert into easyt_admin_audit (id, actor_email, action, target, detail)
    values (${randomUUID()}, ${input.updatedBy}, 'route_content_updated', ${input.routeKey},
      ${JSON.stringify({ published: row.published, featured: row.featured })}::jsonb)
  `;
  return row;
}

export type EasyTAdminUser = {
  id: string;
  email: string;
  name: string | null;
  tripCount: number;
  lastTripActivity: string | null;
  createdAt: string;
};

export async function listEasyTAdminUsers(): Promise<EasyTAdminUser[]> {
  const sql = getEasyTDatabase();
  return (await sql`
    select users.id, users.email, users.name,
      count(trips.id)::int as "tripCount",
      max(trips.updated_at) as "lastTripActivity",
      users.created_at as "createdAt"
    from easyt_users users
    left join easyt_trips trips on trips.owner_id = users.id and trips.deleted_at is null
    group by users.id, users.email, users.name, users.created_at
    order by max(trips.updated_at) desc nulls last, users.created_at desc
    limit 500
  `) as EasyTAdminUser[];
}

export type EasyTAdminAuditEvent = {
  id: string;
  actorEmail: string;
  action: string;
  target: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

export async function listEasyTAdminAuditEvents(limit = 250): Promise<EasyTAdminAuditEvent[]> {
  const sql = getEasyTDatabase();
  return (await sql`
    select id, actor_email as "actorEmail", action, target, detail, created_at as "createdAt"
    from easyt_admin_audit
    order by created_at desc
    limit ${Math.min(Math.max(limit, 1), 500)}
  `) as EasyTAdminAuditEvent[];
}

export async function recordEasyTAdminAuditEvent(input: {
  actorEmail: string;
  action: string;
  target: string;
  detail?: Record<string, unknown>;
}) {
  const sql = getEasyTDatabase();
  await sql`
    insert into easyt_admin_audit (id, actor_email, action, target, detail)
    values (${randomUUID()}, ${input.actorEmail}, ${input.action}, ${input.target}, ${JSON.stringify(input.detail ?? {})}::jsonb)
  `;
}

export async function deleteEasyTUser(input: { email: string; actorEmail: string }) {
  const sql = getEasyTDatabase();
  const [user] = (await sql`
    select id, email from easyt_users where lower(email) = lower(${input.email}) limit 1
  `) as Array<{ id: string; email: string }>;
  if (!user) return false;

  await sql.transaction((transaction) => [
    transaction`delete from easyt_feedback where owner_id = ${user.id}`,
    transaction`delete from "session" where "userId" = ${user.id}`,
    transaction`delete from account where "userId" = ${user.id}`,
    transaction`delete from verification where lower(identifier) = lower(${user.email})`,
    transaction`delete from easyt_users where id = ${user.id}`,
    transaction`delete from "user" where id = ${user.id}`,
    transaction`
      insert into easyt_admin_audit (id, actor_email, action, target, detail)
      values (${randomUUID()}, ${input.actorEmail}, 'account_deleted', ${`user:${user.id}`}, '{}'::jsonb)
    `,
  ]);
  return true;
}

export function applyEasyTRouteControls<T extends { key: string }>(routes: T[], controls: EasyTRouteControl[]) {
  const byKey = new Map(controls.map((control) => [control.routeKey, control]));
  return routes
    .filter((route) => byKey.get(route.key)?.published !== false)
    .sort((left, right) => {
      const a = byKey.get(left.key);
      const b = byKey.get(right.key);
      return Number(Boolean(b?.featured)) - Number(Boolean(a?.featured)) || (a?.featuredOrder ?? Number.MAX_SAFE_INTEGER) - (b?.featuredOrder ?? Number.MAX_SAFE_INTEGER);
    });
}
