-- Shared user-approval gate across every Tijamo app on this Supabase project.
--
-- New sign-ups land in auth.users the same as always -- Pitchstone's signUp
-- flow doesn't change -- but a trigger on that table now drops a pending row
-- here for every one of them, app-agnostic, because the intent is one
-- approval that unlocks Dodo, the ADHD tracker, Kyoyo, Radar, and Binday's
-- alongside Pitchstone itself, not five separate queues. Only Pitchstone
-- enforces it today (see ApprovalGate in src/); another app adopts the same
-- gate by reading this table the way Pitchstone does -- nothing here is
-- Pitchstone-specific.
--
-- Unprefixed on purpose. Every other table in this project prefixes with its
-- owning app's name because it is that app's own data; this one is shared
-- infrastructure, so it carries the org's name instead.

create table if not exists public.tijamo_user_approvals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  role text not null default 'member' check (role in ('owner', 'member')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id)
);

alter table public.tijamo_user_approvals enable row level security;

-- Whether the signed-in user is an approved owner. Security definer so it can
-- be used inside this table's own RLS policies without those policies having
-- to re-embed the same subquery, and so it is reusable by any app that later
-- wants to gate something on ownership.
create or replace function public.tijamo_is_owner()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.tijamo_user_approvals
     where user_id = auth.uid() and role = 'owner' and status = 'approved'
  );
$$;

-- Revoked from all three by name, not just `public`: this project's default
-- privileges grant execute on every new public function to anon and
-- authenticated separately, so a revoke from public alone leaves those
-- standing -- the same trap pitchstone_mcp.sql documents and was caught here
-- by the advisor after the first pass of this migration, then fixed in a
-- second pass folded into this file so it alone reproduces the end state.
revoke execute on function public.tijamo_is_owner() from public, anon, authenticated;
grant execute on function public.tijamo_is_owner() to authenticated;

drop policy if exists user_reads_own_approval on public.tijamo_user_approvals;
create policy user_reads_own_approval on public.tijamo_user_approvals
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists owner_reads_all_approvals on public.tijamo_user_approvals;
create policy owner_reads_all_approvals on public.tijamo_user_approvals
  for select to authenticated
  using (public.tijamo_is_owner());

-- Deliberately no insert/update/delete policy for anon or authenticated:
-- every write goes through tijamo_handle_new_user (the trigger below) or
-- tijamo_decide_user (the owner's one door), both security definer, never a
-- direct table write from a client.

-- One row per new signup, across every app that shares this project's
-- auth.users -- this is the trigger that makes the queue app-agnostic.
create or replace function public.tijamo_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tijamo_user_approvals (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_tijamo_approval on auth.users;
create trigger on_auth_user_created_tijamo_approval
  after insert on auth.users
  for each row execute function public.tijamo_handle_new_user();

-- Trigger firing never checks EXECUTE grants, so this needs none, and nobody
-- should be able to invoke it directly as an RPC (calling a trigger function
-- outside trigger context errors anyway, but a door left unlocked is still a
-- door).
revoke execute on function public.tijamo_handle_new_user() from public, anon, authenticated;

-- The owner's one write: approve or reject a pending account. Gated on
-- tijamo_is_owner() rather than an update policy, so the decision -- who,
-- when -- is always recorded in the same statement that makes it, and a
-- client can never move a row straight to 'approved' by writing the table
-- directly.
create or replace function public.tijamo_decide_user(p_user_id uuid, p_status text)
returns public.tijamo_user_approvals
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.tijamo_user_approvals;
begin
  if not public.tijamo_is_owner() then
    raise exception 'only the owner can decide this' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'invalid status %', p_status;
  end if;

  update public.tijamo_user_approvals
     set status = p_status, decided_at = now(), decided_by = auth.uid()
   where user_id = p_user_id
  returning * into result;

  if not found then
    raise exception 'no such account';
  end if;

  return result;
end;
$$;

revoke execute on function public.tijamo_decide_user(uuid, text) from public, anon, authenticated;
grant execute on function public.tijamo_decide_user(uuid, text) to authenticated;

-- Realtime: the owner's Pitchstone tab watches for new pending rows to pop a
-- notification, and a pending user's tab watches its own row to notice the
-- moment it's decided. Realtime enforces this table's RLS for both.
alter publication supabase_realtime add table public.tijamo_user_approvals;

-- Backfill: everyone who already has an account today keeps working exactly
-- as before. Only signups from here on join the queue.
insert into public.tijamo_user_approvals (user_id, email, status, decided_at)
select id, email, 'approved', now()
  from auth.users
 on conflict (user_id) do nothing;

update public.tijamo_user_approvals
   set role = 'owner'
 where email = 'timjimmoore@gmail.com';
