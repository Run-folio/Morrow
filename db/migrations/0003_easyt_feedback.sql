create table if not exists easyt_feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id text references easyt_users(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  surface text not null default 'dashboard',
  created_at timestamptz not null default now()
);

create index if not exists easyt_feedback_owner_created_idx
  on easyt_feedback (owner_id, created_at desc);
