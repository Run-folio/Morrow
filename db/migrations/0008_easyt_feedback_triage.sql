alter table easyt_feedback
  add column if not exists status text not null default 'new' check (status in ('new', 'reviewed', 'planned', 'resolved')),
  add column if not exists internal_note text,
  add column if not exists triaged_by text,
  add column if not exists triaged_at timestamptz;

create index if not exists easyt_feedback_status_created_idx
  on easyt_feedback (status, created_at desc);
