create table if not exists easyt_email_events (
  id text primary key,
  provider_id text,
  recipient_email text not null,
  subject text not null,
  template text not null,
  status text not null default 'sent' check (status in ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists easyt_email_events_provider_idx
  on easyt_email_events(provider_id) where provider_id is not null;
create index if not exists easyt_email_events_created_idx
  on easyt_email_events(created_at desc);
