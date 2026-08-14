-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).

create table if not exists quota_teams (
    role_id    text primary key,
    quota      integer not null check (quota > 0),
    updated_at timestamptz not null default now()
);

create table if not exists quota_waves (
    id         bigint generated always as identity primary key,
    number     integer not null unique,
    started_at timestamptz not null default now(),
    ended_at   timestamptz
);

create table if not exists quota_wave_members (
    wave_id  bigint not null references quota_waves(id) on delete cascade,
    user_id  text not null,
    role_id  text,
    quota    integer,
    count    integer not null default 0,
    primary key (wave_id, user_id)
);

create index if not exists quota_wave_members_wave_id_idx on quota_wave_members(wave_id);

-- Atomic upsert-increment so concurrent messages can't race each other.
create or replace function quota_track_message(
    p_wave_id bigint,
    p_user_id text,
    p_role_id text,
    p_quota   integer
) returns void
language sql
as $$
    insert into quota_wave_members (wave_id, user_id, role_id, quota, count)
    values (p_wave_id, p_user_id, p_role_id, p_quota, 1)
    on conflict (wave_id, user_id)
    do update set
        count   = quota_wave_members.count + 1,
        role_id = excluded.role_id,
        quota   = excluded.quota;
$$;

-- Bot connects with the service_role key and talks to Postgres directly,
-- so RLS is bypassed. No policies are required for this table set.
