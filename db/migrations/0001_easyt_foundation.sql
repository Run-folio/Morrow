create extension if not exists pgcrypto;

create table if not exists easyt_users (
  id text primary key,
  email text not null unique,
  name text,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists easyt_trips (
  id text primary key,
  owner_id text not null references easyt_users(id) on delete cascade,
  title text not null,
  start_date date not null,
  end_date date not null,
  travellers integer not null default 1 check (travellers > 0),
  travel_mode text,
  status text not null default 'draft' check (status in ('draft', 'planned', 'archived')),
  pace text not null default 'slow',
  currency char(3) not null default 'GBP',
  brief jsonb not null default '{}'::jsonb,
  document jsonb not null,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_date >= start_date)
);

create index if not exists easyt_trips_owner_updated_idx on easyt_trips(owner_id, updated_at desc) where deleted_at is null;

create table if not exists easyt_stops (
  id text primary key,
  trip_id text not null references easyt_trips(id) on delete cascade,
  stop_order integer not null,
  name text not null,
  country text,
  latitude double precision,
  longitude double precision,
  arrival_date date,
  departure_date date,
  nights integer check (nights is null or nights >= 0),
  unique (trip_id, stop_order)
);

create index if not exists easyt_stops_trip_idx on easyt_stops(trip_id, stop_order);

create table if not exists easyt_legs (
  id text primary key,
  trip_id text not null references easyt_trips(id) on delete cascade,
  from_stop_id text not null references easyt_stops(id) on delete cascade,
  to_stop_id text not null references easyt_stops(id) on delete cascade,
  mode text not null default 'unknown',
  distance_km numeric,
  duration_minutes integer,
  provider text,
  route_metadata jsonb not null default '{}'::jsonb
);

create table if not exists easyt_plan_items (
  id text primary key,
  trip_id text not null references easyt_trips(id) on delete cascade,
  stop_id text references easyt_stops(id) on delete set null,
  day_number integer not null,
  plan_date date not null,
  item_type text not null,
  title text not null,
  reason text,
  notes jsonb not null default '[]'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  booking_url text,
  latitude double precision,
  longitude double precision
);

create index if not exists easyt_plan_items_trip_day_idx on easyt_plan_items(trip_id, day_number);

create table if not exists easyt_recommendations (
  id text primary key,
  trip_id text not null references easyt_trips(id) on delete cascade,
  rule text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  message text not null,
  proposed_change jsonb,
  status text not null default 'open' check (status in ('open', 'applied', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists easyt_recommendations_trip_idx on easyt_recommendations(trip_id, status);
