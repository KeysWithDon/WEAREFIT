create or replace function public.is_approved_coach_for(target_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.portal_states
    where owner_id = target_owner
      and coach_email = public.current_email()
      and state -> 'accounts' -> owner_email ->> 'coachRequestStatus' = 'approved'
      and public.is_coach()
  );
$$;

create or replace function public.can_access_owner(target_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_owner = auth.uid() or public.is_approved_coach_for(target_owner);
$$;

drop policy if exists "profiles read own or assigned" on public.profiles;
create policy "profiles read own or assigned"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_approved_coach_for(id));

drop policy if exists "portal states read own or assigned" on public.portal_states;
create policy "portal states read own or assigned"
on public.portal_states for select to authenticated
using (owner_id = auth.uid() or public.is_approved_coach_for(owner_id));

drop policy if exists "portal states update own or assigned" on public.portal_states;
create policy "portal states update own or assigned"
on public.portal_states for update to authenticated
using (owner_id = auth.uid() or public.is_approved_coach_for(owner_id))
with check (owner_id = auth.uid() or public.is_approved_coach_for(owner_id));
