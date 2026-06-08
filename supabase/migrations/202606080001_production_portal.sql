create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role text not null default 'user' check (role in ('user', 'coach')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_states (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  owner_email text not null unique,
  role text not null check (role in ('user', 'coach')),
  coach_email text,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  email_type text not null,
  recipient text not null,
  provider_id text,
  status text not null default 'sent',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'name', ''),
    case when new.raw_user_meta_data->>'role' = 'coach' then 'coach' else 'user' end
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt()->>'email', ''));
$$;

create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'coach'
  );
$$;

create or replace function public.can_access_owner(target_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_owner = auth.uid()
    or exists (
      select 1
      from public.portal_states
      where owner_id = target_owner
        and coach_email = public.current_email()
        and public.is_coach()
    );
$$;

alter table public.profiles enable row level security;
alter table public.portal_states enable row level security;
alter table public.email_audit enable row level security;

drop policy if exists "profiles read own or assigned" on public.profiles;
create policy "profiles read own or assigned"
on public.profiles for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1 from public.portal_states
    where owner_id = profiles.id
      and coach_email = public.current_email()
      and public.is_coach()
  )
);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "portal states read own or assigned" on public.portal_states;
create policy "portal states read own or assigned"
on public.portal_states for select to authenticated
using (
  owner_id = auth.uid()
  or (coach_email = public.current_email() and public.is_coach())
);

drop policy if exists "portal states insert own" on public.portal_states;
create policy "portal states insert own"
on public.portal_states for insert to authenticated
with check (owner_id = auth.uid() and owner_email = public.current_email());

drop policy if exists "portal states update own or assigned" on public.portal_states;
create policy "portal states update own or assigned"
on public.portal_states for update to authenticated
using (
  owner_id = auth.uid()
  or (coach_email = public.current_email() and public.is_coach())
)
with check (
  owner_id = auth.uid()
  or (coach_email = public.current_email() and public.is_coach())
);

drop policy if exists "email audit read own" on public.email_audit;
create policy "email audit read own"
on public.email_audit for select to authenticated
using (actor_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-photos', 'profile-photos', false, 1048576, array['image/png','image/jpeg','image/webp']),
  ('financial-documents', 'financial-documents', false, 2097152, array['application/pdf','image/png','image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "private files insert own folder" on storage.objects;
create policy "private files insert own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('profile-photos', 'financial-documents')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "private files read own or assigned" on storage.objects;
create policy "private files read own or assigned"
on storage.objects for select to authenticated
using (
  bucket_id in ('profile-photos', 'financial-documents')
  and public.can_access_owner(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "private files delete own" on storage.objects;
create policy "private files delete own"
on storage.objects for delete to authenticated
using (
  bucket_id in ('profile-photos', 'financial-documents')
  and (storage.foldername(name))[1] = auth.uid()::text
);

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.portal_states to authenticated;
grant select on public.email_audit to authenticated;
