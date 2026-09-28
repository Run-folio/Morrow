alter table easyt_feedback
  add column if not exists survey_id text,
  add column if not exists attempt_id uuid,
  add column if not exists payload_hash text;

create unique index if not exists easyt_feedback_one_survey_response_idx
  on easyt_feedback (owner_id, survey_id)
  where owner_id is not null and survey_id is not null;

create table if not exists easyt_feedback_survey_state (
  owner_id text not null references easyt_users(id) on delete cascade,
  survey_id text not null,
  dismissed_at timestamptz not null default now(),
  primary key (owner_id, survey_id)
);
