-- Pitchstone: the note vault.
--
-- Follows the Tijamo-hub convention: pitchstone_* tables, RLS keyed on
-- auth.uid() = user_id, sharing the project's existing auth users.

create table if not exists public.pitchstone_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Vault-relative path including folders and the .md extension,
  -- e.g. 'Projects/Pitchstone.md'.
  path text not null,
  -- Derived from path by trigger; clients never set it.
  title text not null default '',
  content text not null default '',
  frontmatter jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) stored,
  constraint pitchstone_notes_path_unique unique (user_id, path),
  constraint pitchstone_notes_path_valid check (
    path ~ '^[^/].*\.md$'
    and path !~ '(^|/)\.\.?(/|$)'
    and path !~ '//'
    and length(path) between 4 and 512
  )
);

-- Links are kept even when unresolved (target_note_id is null), so the graph
-- can show a link to a note that does not exist yet, as Obsidian does.
create table if not exists public.pitchstone_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_note_id uuid not null references public.pitchstone_notes(id) on delete cascade,
  target_title text not null,
  target_note_id uuid references public.pitchstone_notes(id) on delete set null,
  link_type text not null default 'wikilink' check (link_type in ('wikilink', 'embed')),
  created_at timestamptz not null default now(),
  constraint pitchstone_links_unique unique (source_note_id, target_title, link_type)
);

create table if not exists public.pitchstone_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  theme text check (theme in ('dark', 'light')),
  last_note_id uuid references public.pitchstone_notes(id) on delete set null,
  ui jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Indexes -------------------------------------------------------------------

create index if not exists pitchstone_notes_search_idx
  on public.pitchstone_notes using gin (search);
create index if not exists pitchstone_notes_tags_idx
  on public.pitchstone_notes using gin (tags);
-- Link resolution matches on lower(title) within a user's vault.
create index if not exists pitchstone_notes_user_title_idx
  on public.pitchstone_notes (user_id, lower(title));
create index if not exists pitchstone_links_source_idx
  on public.pitchstone_links (source_note_id);
create index if not exists pitchstone_links_target_idx
  on public.pitchstone_links (target_note_id);
create index if not exists pitchstone_links_user_title_idx
  on public.pitchstone_links (user_id, lower(target_title));

-- Triggers ------------------------------------------------------------------

create or replace function public.pitchstone_notes_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Title is always the basename without the .md extension, so a rename that
  -- moves a note between folders keeps its title in step automatically.
  new.title := regexp_replace(regexp_replace(new.path, '^.*/', ''), '\.md$', '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pitchstone_notes_before_write on public.pitchstone_notes;
create trigger pitchstone_notes_before_write
  before insert or update on public.pitchstone_notes
  for each row execute function public.pitchstone_notes_before_write();

-- Link resolution -----------------------------------------------------------

-- Point every link at the note whose title it names, and unpoint any link
-- whose target no longer matches. Called after a note is created, renamed, or
-- deleted, so creating a note lights up links that were unresolved until now.
create or replace function public.pitchstone_resolve_links(uid uuid default auth.uid())
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.pitchstone_links l
     set target_note_id = null
   where l.user_id = uid
     and l.target_note_id is not null
     and not exists (
       select 1 from public.pitchstone_notes n
        where n.id = l.target_note_id
          and n.user_id = uid
          and lower(n.title) = lower(l.target_title)
     );

  update public.pitchstone_links l
     set target_note_id = n.id
    from public.pitchstone_notes n
   where l.user_id = uid
     and n.user_id = uid
     and lower(n.title) = lower(l.target_title)
     and l.target_note_id is distinct from n.id;
end;
$$;

-- RLS -----------------------------------------------------------------------

alter table public.pitchstone_notes enable row level security;
alter table public.pitchstone_links enable row level security;
alter table public.pitchstone_settings enable row level security;

drop policy if exists user_owns_pitchstone_notes on public.pitchstone_notes;
create policy user_owns_pitchstone_notes on public.pitchstone_notes
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_owns_pitchstone_links on public.pitchstone_links;
create policy user_owns_pitchstone_links on public.pitchstone_links
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_owns_pitchstone_settings on public.pitchstone_settings;
create policy user_owns_pitchstone_settings on public.pitchstone_settings
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant execute on function public.pitchstone_resolve_links(uuid) to authenticated;
