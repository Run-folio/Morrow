alter table easyt_email_events
  add column if not exists idempotency_key text;

create unique index if not exists easyt_email_events_idempotency_idx
  on easyt_email_events(idempotency_key)
  where idempotency_key is not null;
