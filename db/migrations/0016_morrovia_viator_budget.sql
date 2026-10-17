-- Operational state only. Prepare/review locally; apply separately before activation.
-- App-origin + provider environment identifies one shared budget. No user or IP data.
create table if not exists morrovia_viator_budget (
  scope text primary key check (length(scope) between 1 and 300),
  attempts timestamptz[] not null default '{}' check (cardinality(attempts) <= 1000),
  cooldown_until timestamptz not null default '-infinity',
  leases jsonb not null default '{}'::jsonb check (jsonb_typeof(leases) = 'object')
);

-- One bounded (<=1000 timestamp) history gives true trailing-minute/day limits.
-- The row lock serializes claims, including the first-claim insertion race.
create or replace function morrovia_viator_claim(p_scope text, p_token uuid)
returns table(admitted boolean, retry_after_seconds integer)
language plpgsql as $$
declare
  budget morrovia_viator_budget%rowtype;
  checked timestamptz;
  active jsonb;
  recent timestamptz[];
  minute_count integer;
  oldest_minute timestamptz;
  wait_seconds numeric;
begin
  insert into morrovia_viator_budget(scope) values(p_scope) on conflict do nothing;
  select * into strict budget from morrovia_viator_budget where scope=p_scope for update;
  checked := clock_timestamp();
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into active
    from jsonb_each(budget.leases) where (value::text)::numeric > extract(epoch from checked);
  select coalesce(array_agg(attempt order by attempt),'{}'::timestamptz[]) into recent
    from unnest(budget.attempts) as attempt where attempt > checked-interval '24 hours';
  select count(*), min(attempt) into minute_count, oldest_minute
    from unnest(recent) as attempt where attempt > checked-interval '60 seconds';
  wait_seconds := greatest(0,extract(epoch from budget.cooldown_until-checked));
  if minute_count >= 20 then
    wait_seconds := greatest(wait_seconds,extract(epoch from oldest_minute+interval '60 seconds'-checked));
  end if;
  if cardinality(recent) >= 1000 then
    wait_seconds := greatest(wait_seconds,extract(epoch from recent[1]+interval '24 hours'-checked));
  end if;
  if (select count(*) from jsonb_each(active)) >= 2 then
    wait_seconds := greatest(wait_seconds,(select min((value::text)::numeric)-extract(epoch from checked) from jsonb_each(active)));
  end if;
  if wait_seconds > 0 then
    -- Feedback is bounded; admission still honors the full provider cooldown,
    -- including infinity for values too large to represent safely as an interval.
    return query select false, greatest(1,least(86400,ceil(wait_seconds))::integer);
    return;
  end if;
  -- Lease exceeds maximum 30-second provider timeout. Timeout cannot free a live call.
  update morrovia_viator_budget set attempts=array_append(recent,checked),
    leases=active || jsonb_build_object(p_token::text,extract(epoch from checked+interval '60 seconds'))
    where scope=p_scope;
  return query select true, 0;
end;
$$;
