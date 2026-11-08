-- =====================================================================
-- Chat log schema (all-uppercase identifiers — must be double-quoted in SQL)
-- Reads: anyone (anon key) via RLS SELECT policies + Realtime
-- Writes: only FastAPI (service_role key bypasses RLS)
-- Firebase / DEVICE_TOKENS intentionally omitted (not in scope).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- CLIENT_APPS: front-ends and deployable components (numbering = project plan)
-- ---------------------------------------------------------------------
create table public."CLIENT_APPS" (
  "APP_ID"        smallint primary key,
  "APP_CODE"      text not null unique,
  "APP_NAME"      text not null,
  "PLATFORM"      text not null check ("PLATFORM" in ('web', 'android', 'backend', 'database')),
  "FRAMEWORK"     text not null,
  "DEPLOY_TARGET" text not null,
  "PUBLIC_URL"    text,
  "IS_ACTIVE"     boolean not null default true,
  "CREATED_AT"    timestamptz not null default now()
);
comment on table public."CLIENT_APPS" is 'Front-ends 1-5 plus backend (8) and database (9); referenced by sessions, messages and deploy logs';

-- ---------------------------------------------------------------------
-- APP_USERS: 1:1 with auth.users (filled by trigger once login is enabled)
-- ---------------------------------------------------------------------
create table public."APP_USERS" (
  "USER_ID"      uuid primary key references auth.users (id) on delete cascade,
  "DISPLAY_NAME" text not null default '',
  "AVATAR_URL"   text,
  "CREATED_AT"   timestamptz not null default now(),
  "UPDATED_AT"   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- CHAT_SESSIONS: conversation threads (public room shared by everyone)
-- ---------------------------------------------------------------------
create table public."CHAT_SESSIONS" (
  "SESSION_ID"          uuid primary key default gen_random_uuid(),
  "TITLE"               text not null check (char_length("TITLE") between 1 and 200),
  "IS_PUBLIC"           boolean not null default true,
  "CREATED_BY_USER_ID"  uuid references public."APP_USERS" ("USER_ID") on delete set null,
  "CREATED_FROM_APP_ID" smallint references public."CLIENT_APPS" ("APP_ID"),
  "LAST_MESSAGE_AT"     timestamptz,
  "CREATED_AT"          timestamptz not null default now(),
  "UPDATED_AT"          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- CHAT_MESSAGES: the chat log itself
-- USER_ID is nullable until login is decided; SENDER_NAME is always stored.
-- CLIENT_MESSAGE_ID gives idempotent retries from flaky mobile networks.
-- ---------------------------------------------------------------------
create table public."CHAT_MESSAGES" (
  "MESSAGE_ID"        uuid primary key default gen_random_uuid(),
  "SESSION_ID"        uuid not null references public."CHAT_SESSIONS" ("SESSION_ID") on delete cascade,
  "PARENT_MESSAGE_ID" uuid references public."CHAT_MESSAGES" ("MESSAGE_ID") on delete set null,
  "USER_ID"           uuid references public."APP_USERS" ("USER_ID") on delete set null,
  "SENDER_NAME"       text not null check (char_length("SENDER_NAME") between 1 and 50),
  "SENDER_ROLE"       text not null default 'user' check ("SENDER_ROLE" in ('user', 'assistant', 'system')),
  "CONTENT"           text not null check (char_length("CONTENT") between 1 and 4000),
  "APP_ID"            smallint references public."CLIENT_APPS" ("APP_ID"),
  "CLIENT_MESSAGE_ID" text,
  "IS_DELETED"        boolean not null default false,
  "CREATED_AT"        timestamptz not null default now(),
  "EDITED_AT"         timestamptz,
  constraint "CHAT_MESSAGES_CLIENT_MESSAGE_ID_KEY" unique ("SESSION_ID", "CLIENT_MESSAGE_ID")
);
create index "CHAT_MESSAGES_SESSION_CREATED_IDX" on public."CHAT_MESSAGES" ("SESSION_ID", "CREATED_AT" desc);
create index "CHAT_MESSAGES_PARENT_IDX" on public."CHAT_MESSAGES" ("PARENT_MESSAGE_ID");
create index "CHAT_MESSAGES_USER_IDX" on public."CHAT_MESSAGES" ("USER_ID");
create index "CHAT_MESSAGES_APP_IDX" on public."CHAT_MESSAGES" ("APP_ID");

-- ---------------------------------------------------------------------
-- CHAT_ATTACHMENTS: metadata only, the file lives in Supabase Storage
-- ---------------------------------------------------------------------
create table public."CHAT_ATTACHMENTS" (
  "ATTACHMENT_ID"  uuid primary key default gen_random_uuid(),
  "MESSAGE_ID"     uuid not null references public."CHAT_MESSAGES" ("MESSAGE_ID") on delete cascade,
  "STORAGE_BUCKET" text not null default 'chat-attachments',
  "STORAGE_PATH"   text not null,
  "FILE_NAME"      text not null,
  "MIME_TYPE"      text,
  "SIZE_BYTES"     bigint check ("SIZE_BYTES" >= 0),
  "CREATED_AT"     timestamptz not null default now()
);
create index "CHAT_ATTACHMENTS_MESSAGE_IDX" on public."CHAT_ATTACHMENTS" ("MESSAGE_ID");

-- ---------------------------------------------------------------------
-- MESSAGE_FEEDBACK: thumbs up (1) / down (-1)
-- VOTER_KEY = USER_ID once logged in, otherwise a per-device random id.
-- ---------------------------------------------------------------------
create table public."MESSAGE_FEEDBACK" (
  "FEEDBACK_ID" uuid primary key default gen_random_uuid(),
  "MESSAGE_ID"  uuid not null references public."CHAT_MESSAGES" ("MESSAGE_ID") on delete cascade,
  "USER_ID"     uuid references public."APP_USERS" ("USER_ID") on delete set null,
  "VOTER_KEY"   text not null check (char_length("VOTER_KEY") between 1 and 100),
  "RATING"      smallint not null check ("RATING" in (-1, 1)),
  "CREATED_AT"  timestamptz not null default now(),
  "UPDATED_AT"  timestamptz not null default now(),
  constraint "MESSAGE_FEEDBACK_VOTER_KEY" unique ("MESSAGE_ID", "VOTER_KEY")
);
create index "MESSAGE_FEEDBACK_USER_IDX" on public."MESSAGE_FEEDBACK" ("USER_ID");

-- ---------------------------------------------------------------------
-- DEPLOY_LOGS: written by GitHub Actions (service_role)
-- ---------------------------------------------------------------------
create table public."DEPLOY_LOGS" (
  "DEPLOY_ID"        bigint generated always as identity primary key,
  "APP_ID"           smallint not null references public."CLIENT_APPS" ("APP_ID"),
  "STATUS"           text not null check ("STATUS" in ('started', 'triggered', 'success', 'failure', 'cancelled')),
  "GIT_SHA"          text,
  "GIT_REF"          text,
  "WORKFLOW_RUN_URL" text,
  "ARTIFACT_URL"     text,
  "MESSAGE"          text,
  "CREATED_AT"       timestamptz not null default now()
);
create index "DEPLOY_LOGS_APP_CREATED_IDX" on public."DEPLOY_LOGS" ("APP_ID", "CREATED_AT" desc);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create or replace function public.touch_session_last_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public."CHAT_SESSIONS"
     set "LAST_MESSAGE_AT" = new."CREATED_AT",
         "UPDATED_AT" = now()
   where "SESSION_ID" = new."SESSION_ID";
  return new;
end;
$$;

create trigger "CHAT_MESSAGES_TOUCH_SESSION"
after insert on public."CHAT_MESSAGES"
for each row execute function public.touch_session_last_message();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public."APP_USERS" ("USER_ID", "DISPLAY_NAME")
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)))
  on conflict ("USER_ID") do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_app_users
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- Row Level Security: everyone may read public data, nobody writes via anon key
-- ---------------------------------------------------------------------
alter table public."CLIENT_APPS"      enable row level security;
alter table public."APP_USERS"        enable row level security;
alter table public."CHAT_SESSIONS"    enable row level security;
alter table public."CHAT_MESSAGES"    enable row level security;
alter table public."CHAT_ATTACHMENTS" enable row level security;
alter table public."MESSAGE_FEEDBACK" enable row level security;
alter table public."DEPLOY_LOGS"      enable row level security;

create policy "CLIENT_APPS readable by all" on public."CLIENT_APPS"
  for select to anon, authenticated using (true);

create policy "APP_USERS readable by all" on public."APP_USERS"
  for select to anon, authenticated using (true);

create policy "Public sessions readable by all" on public."CHAT_SESSIONS"
  for select to anon, authenticated using ("IS_PUBLIC");

create policy "Messages in public sessions readable by all" on public."CHAT_MESSAGES"
  for select to anon, authenticated
  using (
    not "IS_DELETED"
    and exists (
      select 1 from public."CHAT_SESSIONS" s
      where s."SESSION_ID" = "CHAT_MESSAGES"."SESSION_ID" and s."IS_PUBLIC"
    )
  );

create policy "Attachments of visible messages readable by all" on public."CHAT_ATTACHMENTS"
  for select to anon, authenticated
  using (
    exists (
      select 1 from public."CHAT_MESSAGES" m
      where m."MESSAGE_ID" = "CHAT_ATTACHMENTS"."MESSAGE_ID"
    )
  );

create policy "Feedback readable by all" on public."MESSAGE_FEEDBACK"
  for select to anon, authenticated using (true);

create policy "Deploy logs readable by all" on public."DEPLOY_LOGS"
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------
-- Realtime: every client sees new messages / votes immediately
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public."CHAT_MESSAGES";
alter publication supabase_realtime add table public."MESSAGE_FEEDBACK";
