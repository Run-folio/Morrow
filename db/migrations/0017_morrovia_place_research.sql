-- DRAFT: stage-only, additive. No policy row or mapping is automatically published.
-- Existing runtime role needs ownership or separately approved scoped privileges.
begin;
do $guard$
begin
  if current_database() is distinct from 'morrovia_staging' then
    raise exception 'Verified isolated staging database required';
  end if;
end;
$guard$;

-- Application-owned deployment attestation, not a database permission or AI activation flag.
-- The migration runner must separately verify the endpoint before applying this file.
create table if not exists public.morrovia_deployment_metadata (
  deployment_key text primary key check (deployment_key='morrovia-staging-v1'),
  environment text not null check (environment='staging'),
  verification_version integer not null check (verification_version=1),
  database_name text not null check (database_name='morrovia_staging'),
  endpoint_host text not null check (endpoint_host='ep-fancy-credit-ar0ithc8.c-4.us-west-2.aws.neon.tech'),
  project_id text not null check (project_id='frosty-mode-70756654'),
  branch_id text not null check (branch_id='br-lingering-sunset-arw7uok8'),
  verification_reference text not null check (verification_reference ~ '^[-a-zA-Z0-9_:]{4,120}$'),
  verified_at timestamptz not null
);
insert into public.morrovia_deployment_metadata(deployment_key,environment,verification_version,database_name,endpoint_host,project_id,branch_id,verification_reference,verified_at)
values('morrovia-staging-v1','staging',1,'morrovia_staging','ep-fancy-credit-ar0ithc8.c-4.us-west-2.aws.neon.tech','frosty-mode-70756654','br-lingering-sunset-arw7uok8','owner-neon-target-20261022',clock_timestamp())
on conflict(deployment_key) do nothing;
do $metadata_guard$
begin
  if not exists(select 1 from public.morrovia_deployment_metadata where deployment_key='morrovia-staging-v1'
    and environment='staging' and verification_version=1 and database_name='morrovia_staging'
    and endpoint_host='ep-fancy-credit-ar0ithc8.c-4.us-west-2.aws.neon.tech'
    and project_id='frosty-mode-70756654' and branch_id='br-lingering-sunset-arw7uok8'
    and verification_reference ~ '^[-a-zA-Z0-9_:]{4,120}$' and verified_at<=clock_timestamp()) then
    raise exception 'Verified isolated staging deployment metadata required';
  end if;
end;
$metadata_guard$;

create table if not exists public.morrovia_place_research_budget (
  scope text primary key check (scope='morrovia:place-research:staging'),
  enabled boolean not null default false,
  policy_version text not null check (policy_version='luna-place-v1'),
  review_reference text not null check (length(review_reference) between 4 and 120),
  qualified_until timestamptz not null,
  reservation_micro_usd bigint not null default 250000 check (reservation_micro_usd=250000),
  total_limit_micro_usd bigint not null default 0 check (total_limit_micro_usd between 0 and 1000000),
  daily_limit_micro_usd bigint not null default 0 check (daily_limit_micro_usd between 0 and 1000000),
  total_reserved_micro_usd bigint not null default 0 check (total_reserved_micro_usd>=0),
  minute_limit integer not null default 4 check (minute_limit between 1 and 4),
  concurrency_limit integer not null default 1 check (concurrency_limit=1),
  claims jsonb not null default '[]' check (jsonb_typeof(claims)='array' and jsonb_array_length(claims)<=1000),
  leases jsonb not null default '{}' check (jsonb_typeof(leases)='object')
);

create or replace function public.morrovia_place_research_claim(
  p_scope text,p_reservation uuid,p_policy_version text,p_upper_micro_usd bigint,p_review_reference text
) returns table(admitted boolean,reservation_id uuid,reserved_micro_usd bigint,policy_version text)
language plpgsql set search_path=pg_catalog,public as $claim$
declare
  budget public.morrovia_place_research_budget%rowtype;
  checked timestamptz;
  recent jsonb;
  active jsonb;
  daily_total bigint;
  minute_count integer;
begin
  -- The policy must already exist; a request can never create/enable its own cap.
  if current_database() is distinct from 'morrovia_staging'
    or not exists(select 1 from public.morrovia_deployment_metadata where deployment_key='morrovia-staging-v1'
      and environment='staging' and verification_version=1 and database_name='morrovia_staging'
      and endpoint_host='ep-fancy-credit-ar0ithc8.c-4.us-west-2.aws.neon.tech'
      and project_id='frosty-mode-70756654' and branch_id='br-lingering-sunset-arw7uok8'
      and verification_reference ~ '^[-a-zA-Z0-9_:]{4,120}$' and verified_at<=clock_timestamp()) then
    return query select false,p_reservation,0::bigint,p_policy_version;return;
  end if;
  select * into budget from public.morrovia_place_research_budget where scope=p_scope for update;
  checked:=clock_timestamp();
  if not found or not budget.enabled or budget.qualified_until<=checked
    or budget.policy_version is distinct from p_policy_version or budget.review_reference is distinct from p_review_reference
    or p_upper_micro_usd is distinct from budget.reservation_micro_usd or p_reservation is null then
    return query select false,p_reservation,0::bigint,p_policy_version;return;
  end if;
  -- Never replay a retained claim identifier, including after a lost receipt.
  if exists(select 1 from jsonb_to_recordset(budget.claims) as c(id uuid,at timestamptz,amount bigint) where c.id=p_reservation) then
    return query select false,p_reservation,0::bigint,p_policy_version;return;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'at',c.at,'amount',c.amount) order by c.at),'[]'::jsonb),
    coalesce(sum(c.amount),0),count(*) filter(where c.at>checked-interval '60 seconds')
    into recent,daily_total,minute_count
    from jsonb_to_recordset(budget.claims) as c(id uuid,at timestamptz,amount bigint)
    where c.at>checked-interval '24 hours';
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into active
    from jsonb_each(budget.leases) where (value::text)::numeric>extract(epoch from checked);
  if budget.total_reserved_micro_usd+p_upper_micro_usd>budget.total_limit_micro_usd
    or daily_total+p_upper_micro_usd>budget.daily_limit_micro_usd or minute_count>=budget.minute_limit
    or jsonb_array_length(recent)>=1000 or (select count(*) from jsonb_each(active))>=budget.concurrency_limit then
    return query select false,p_reservation,0::bigint,p_policy_version;return;
  end if;
  -- Timeouts, errors and expired leases never refund the lifetime charge.
  update public.morrovia_place_research_budget set total_reserved_micro_usd=total_reserved_micro_usd + p_upper_micro_usd,
    claims=recent||jsonb_build_array(jsonb_build_object('id',p_reservation,'at',checked,'amount',p_upper_micro_usd)),
    leases=active||jsonb_build_object(p_reservation::text,extract(epoch from checked+interval '60 seconds'))
    where scope=p_scope;
  return query select true,p_reservation,p_upper_micro_usd,p_policy_version;
end;
$claim$;
revoke all on function public.morrovia_place_research_claim(text,uuid,text,bigint,text) from public;

create table if not exists public.morrovia_reviewed_place_mappings (
  normalized_query text not null check (length(normalized_query) between 2 and 80),
  country_context text not null default '' check (country_context='' or country_context~'^[A-Z]{2}$'),
  intent text not null check (intent='route-stop'),
  verification_version text not null check (verification_version='public-place-v1'),
  provider_id text not null check (provider_id~'^photon:[NWR]:[1-9][0-9]*$'),
  status text not null check (status in ('reviewed','revoked')),
  alternate_name text not null check (length(alternate_name) between 2 and 80),
  provider_key text not null check (length(provider_key) between 1 and 40),
  provider_kind text not null check (length(provider_kind) between 1 and 50),
  place_type text not null check (place_type in ('city','town','natural_area','landmark','island','mountain_range','valley')),
  country_code text not null check (country_code~'^[A-Z]{2}$'),
  source_urls jsonb not null check (jsonb_typeof(source_urls)='array' and jsonb_array_length(source_urls) between 1 and 4),
  review_reference text not null check (length(review_reference) between 4 and 120),
  reviewed_at timestamptz not null,
  expires_at timestamptz not null check (expires_at>reviewed_at and expires_at<=reviewed_at+interval '30 days'),
  primary key(normalized_query,country_context,intent,verification_version,provider_id)
);
-- Runtime adapters SELECT only. Publication/revocation is a separate reviewed operation.
commit;
