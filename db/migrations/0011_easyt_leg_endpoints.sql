-- Canonical routes can start or end at a non-overnight endpoint (for example
-- the traveller's London origin). Keep the normalized stop relations when an
-- endpoint is an overnight stop, while storing every canonical endpoint ID.
alter table easyt_legs
  add column if not exists from_endpoint_id text,
  add column if not exists to_endpoint_id text,
  add column if not exists from_endpoint_kind text,
  add column if not exists to_endpoint_kind text;

update easyt_legs
set from_endpoint_id = coalesce(from_endpoint_id, from_stop_id),
    to_endpoint_id = coalesce(to_endpoint_id, to_stop_id),
    from_endpoint_kind = coalesce(from_endpoint_kind, 'stop'),
    to_endpoint_kind = coalesce(to_endpoint_kind, 'stop');

alter table easyt_legs
  alter column from_endpoint_id set not null,
  alter column to_endpoint_id set not null,
  alter column from_endpoint_kind set not null,
  alter column to_endpoint_kind set not null,
  alter column from_stop_id drop not null,
  alter column to_stop_id drop not null;

alter table easyt_legs
  add constraint easyt_legs_from_endpoint_kind_check
    check (from_endpoint_kind in ('origin', 'stop')),
  add constraint easyt_legs_to_endpoint_kind_check
    check (to_endpoint_kind in ('origin', 'stop')),
  add constraint easyt_legs_from_endpoint_stop_check
    check ((from_endpoint_kind = 'stop') = (from_stop_id is not null)),
  add constraint easyt_legs_to_endpoint_stop_check
    check ((to_endpoint_kind = 'stop') = (to_stop_id is not null));

