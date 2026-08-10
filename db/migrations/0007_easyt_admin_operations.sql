create table if not exists easyt_route_controls (
  route_key text primary key,
  published boolean not null default true,
  featured boolean not null default false,
  featured_order integer,
  updated_by text,
  updated_at timestamptz not null default now()
);

create index if not exists easyt_route_controls_featured_idx
  on easyt_route_controls (featured desc, featured_order asc);

create table if not exists easyt_admin_audit (
  id text primary key,
  actor_email text not null,
  action text not null,
  target text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists easyt_admin_audit_created_idx
  on easyt_admin_audit (created_at desc);
