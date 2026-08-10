create table if not exists easyt_country_memories (
  owner_id text not null references easyt_users(id) on delete cascade,
  country_id text not null,
  note text,
  photo_data text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, country_id),
  check (char_length(coalesce(note, '')) <= 2000),
  check (char_length(coalesce(photo_data, '')) <= 2200000)
);
