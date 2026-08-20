-- Pitchstone: make a note's derived data (tags, frontmatter, links) something
-- that can be rebuilt, not only something written on the way past.
--
-- pitchstone_save_note only ever ran on a save, so every note written before
-- it existed still has empty tags and no link rows — the tags panel and the
-- graph read as empty on a vault that plainly is not. Extraction deliberately
-- lives in one TypeScript module (lib/markdown/parse.ts) so the app and the
-- MCP server cannot drift, so the backfill re-parses client-side and calls
-- pitchstone_reindex_note rather than growing a second parser in SQL.

alter table public.pitchstone_notes
  add column if not exists indexed_at timestamptz;

-- Finding the notes still to index is the one query the backfill runs on every
-- load, so it gets a partial index rather than a sequential scan.
create index if not exists pitchstone_notes_unindexed_idx
  on public.pitchstone_notes (user_id)
  where indexed_at is null;

-- updated_at means "when the note last changed", and re-deriving tags from
-- text that did not change is not a change. Without this every backfill would
-- restamp the whole vault as modified today.
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

  if tg_op = 'INSERT'
     or new.content is distinct from old.content
     or new.path is distinct from old.path then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;

  -- A note born empty has nothing to extract and starts life already indexed;
  -- one born with text needs a pass, whoever inserted it. Deciding it here
  -- rather than with a column default covers the MCP server writing directly.
  if tg_op = 'INSERT' and new.content <> '' then
    new.indexed_at := null;
  elsif tg_op = 'INSERT' then
    new.indexed_at := now();
  end if;

  return new;
end;
$$;

-- Rewrite a note's derived data from text the client has already parsed,
-- leaving content untouched (and so updated_at with it).
create or replace function public.pitchstone_reindex_note(
  p_note_id uuid,
  p_tags text[],
  p_frontmatter jsonb,
  p_links jsonb -- [{"target": "...", "type": "wikilink" | "embed"}, ...]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  update public.pitchstone_notes
     set tags = p_tags,
         frontmatter = p_frontmatter,
         indexed_at = now()
   where id = p_note_id
     and user_id = uid;

  if not found then
    raise exception 'note not found';
  end if;

  delete from public.pitchstone_links
   where source_note_id = p_note_id
     and user_id = uid;

  insert into public.pitchstone_links (user_id, source_note_id, target_title, link_type)
  select uid, p_note_id, elem->>'target', elem->>'type'
    from jsonb_array_elements(p_links) as elem;

  perform public.pitchstone_resolve_links(uid);
end;
$$;

grant execute on function public.pitchstone_reindex_note(uuid, text[], jsonb, jsonb) to authenticated;

-- A save is now just a content write plus a reindex, so the two paths cannot
-- disagree about what "indexed" means.
create or replace function public.pitchstone_save_note(
  p_note_id uuid,
  p_content text,
  p_tags text[],
  p_frontmatter jsonb,
  p_links jsonb
)
returns public.pitchstone_notes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.pitchstone_notes;
  uid uuid := auth.uid();
begin
  update public.pitchstone_notes
     set content = p_content
   where id = p_note_id
     and user_id = uid
   returning * into result;

  if not found then
    raise exception 'note not found';
  end if;

  perform public.pitchstone_reindex_note(p_note_id, p_tags, p_frontmatter, p_links);

  select * into result from public.pitchstone_notes where id = p_note_id;
  return result;
end;
$$;
