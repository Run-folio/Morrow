-- Review numbering against the integration snapshot before applying. Local schema only.
create table if not exists morrovia_calendar_grants (
 id uuid primary key, owner_id text not null references easyt_users(id) on delete cascade,
 subject text not null, account_label text not null, token_cipher text, expires_at timestamptz,
 generation integer not null default 1, scopes jsonb not null default '[]', unique(owner_id,subject)
);
create table if not exists morrovia_calendar_oauth_states (
 state_hash text primary key, owner_id text not null references easyt_users(id) on delete cascade,
 trip_id text not null, verifier_cipher text not null, consent_kind text not null,
 expires_at timestamptz not null
);
create table if not exists morrovia_calendar_bindings (
 id uuid primary key, owner_id text not null references easyt_users(id) on delete cascade,
 trip_id text not null, subject text not null, calendar_id text not null,
 document jsonb not null, last_used_at timestamptz not null default now(), version integer not null default 0,
 lease_token uuid, lease_until timestamptz,
 unique(owner_id,trip_id,subject,calendar_id)
);
create index if not exists morrovia_calendar_bindings_owner_trip on morrovia_calendar_bindings(owner_id,trip_id);
create table if not exists morrovia_calendar_creation_intents (
 owner_id text not null references easyt_users(id) on delete cascade, trip_id text not null,
 grant_id uuid not null references morrovia_calendar_grants(id) on delete cascade,
 marker uuid not null unique, status text not null check(status in ('creating','uncertain','created','rejected')),
 calendar_id text, calendar_label text, primary key(owner_id,trip_id,grant_id)
);
