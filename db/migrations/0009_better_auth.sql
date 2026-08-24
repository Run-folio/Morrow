-- Better Auth 1.6.25 schema for the email-password configuration in auth.config.ts.
-- Keep this in the same migration sequence as the Morrovia persistence tables so
-- a fresh isolated environment can authenticate before its disposable QA users
-- are seeded.

create table if not exists "user" (
  id text primary key,
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null default current_timestamp
);

create table if not exists session (
  id text primary key,
  "expiresAt" timestamptz not null,
  token text not null unique,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null default current_timestamp,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user"(id) on delete cascade
);

create table if not exists account (
  id text primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user"(id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null default current_timestamp
);

create table if not exists verification (
  id text primary key,
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null default current_timestamp
);

create index if not exists session_userId_idx on session("userId");
create index if not exists account_userId_idx on account("userId");
create index if not exists verification_identifier_idx on verification(identifier);
