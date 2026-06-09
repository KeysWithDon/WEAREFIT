create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  account_role text not null check (account_role in ('user', 'coach')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.account_deletion_requests
add column if not exists account_role text;

alter table public.account_deletion_requests
drop constraint if exists account_deletion_requests_account_role_check;

alter table public.account_deletion_requests
add constraint account_deletion_requests_account_role_check
check (account_role in ('user', 'coach'));

create index if not exists account_deletion_requests_lookup
on public.account_deletion_requests (email, token_hash);

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;

create table if not exists public.account_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  last_active_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.account_presence enable row level security;

create policy "presence read connected only"
on public.account_presence for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.portal_states
    where owner_id = auth.uid()
      and coach_email = account_presence.email
      and state -> 'accounts' -> owner_email ->> 'coachRequestStatus' = 'approved'
  )
  or exists (
    select 1 from public.portal_states
    where owner_email = account_presence.email
      and coach_email = public.current_email()
      and state -> 'accounts' -> owner_email ->> 'coachRequestStatus' = 'approved'
      and public.is_coach()
  )
);

create policy "presence insert own"
on public.account_presence for insert to authenticated
with check (user_id = auth.uid() and email = public.current_email());

create policy "presence update own"
on public.account_presence for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and email = public.current_email());

grant select, insert, update on public.account_presence to authenticated;
