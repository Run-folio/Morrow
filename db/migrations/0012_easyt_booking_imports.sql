-- Provider-neutral booking proposals. Inbound sources may create or enrich a
-- candidate, but only an authenticated confirmation writes the trip document.

create table if not exists easyt_booking_import_aliases (
  owner_id text primary key references easyt_users(id) on delete cascade,
  token_hash text not null unique,
  token_hint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists easyt_booking_candidates (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references easyt_users(id) on delete cascade,
  source text not null check (source in ('calendar', 'forwarded_email')),
  fingerprint text not null,
  strict_fingerprint text,
  status text not null default 'pending' check (status in ('pending', 'added', 'ignored')),
  suggested_trip_id text,
  canonical_trip_id text,
  canonical_booking_id text,
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, fingerprint)
);

create index if not exists easyt_booking_candidates_owner_status_idx
  on easyt_booking_candidates(owner_id, status, updated_at desc);
create index if not exists easyt_booking_candidates_owner_strict_idx
  on easyt_booking_candidates(owner_id, strict_fingerprint)
  where strict_fingerprint is not null;

create table if not exists easyt_booking_import_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  webhook_id text not null unique,
  provider_message_id text not null unique,
  owner_id text references easyt_users(id) on delete set null,
  candidate_id uuid references easyt_booking_candidates(id) on delete set null,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'rejected', 'failed')),
  result_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists easyt_booking_import_events_received_idx
  on easyt_booking_import_events(received_at desc);

comment on column easyt_booking_import_events.result_code is
  'Categorical processing result only; never store subject, body, sender, reference, URL, or parser output.';
