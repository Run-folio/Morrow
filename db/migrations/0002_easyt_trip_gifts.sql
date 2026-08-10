-- Gifted plans stay independent: claiming creates an editable copy for the recipient.
create table if not exists easyt_trip_gifts (
  id text primary key,
  trip_id text not null references easyt_trips(id) on delete cascade,
  sender_id text not null references easyt_users(id) on delete cascade,
  recipient_email text not null,
  note text,
  token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'revoked', 'expired')),
  claimed_by text references easyt_users(id) on delete set null,
  claimed_trip_id text references easyt_trips(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  revoked_at timestamptz
);

create index if not exists easyt_trip_gifts_sender_idx
  on easyt_trip_gifts(sender_id, created_at desc);
create index if not exists easyt_trip_gifts_recipient_idx
  on easyt_trip_gifts(lower(recipient_email), status);
