create table if not exists easyt_country_stamps (
  owner_id text not null references easyt_users(id) on delete cascade,
  country_id text not null,
  status text not null check (status in ('visited', 'want')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, country_id)
);

create index if not exists easyt_country_stamps_owner_status_idx
  on easyt_country_stamps (owner_id, status);
