create table if not exists easyt_copilot_previews (
  id uuid primary key,
  owner_id text not null references easyt_users(id) on delete cascade,
  trip_id text not null references easyt_trips(id) on delete cascade,
  action_type text not null check (action_type in ('change_stop_nights', 'set_trip_preference', 'change_transport_preference')),
  action jsonb not null,
  base_updated_at text not null,
  base_hash text not null,
  expected_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'applying', 'applied', 'stale')),
  result_document jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists easyt_copilot_previews_owner_trip_idx
  on easyt_copilot_previews(owner_id, trip_id, created_at desc);

create index if not exists easyt_copilot_previews_expiry_idx
  on easyt_copilot_previews(expires_at)
  where status in ('pending', 'applying');
