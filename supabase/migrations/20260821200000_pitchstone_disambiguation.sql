-- Disambiguation: the vault's per-project memory shape (Memory/Projects/
-- <Project>/gotchas.md, one per project, on purpose) guarantees the same
-- title exists more than once. Everything that used to resolve "the note
-- named X" by title alone -- an MCP path argument, a [[wikilink]] -- picked
-- one arbitrarily when more than one note matched, silently: a link could
-- point at the wrong project's note, and an MCP write could land in one.
--
-- pitchstone_notes_matching is the one rule every caller now goes through.
-- A bare word matches by title, as it always has. Anything containing a
-- slash matches by the *trailing* segments of a note's path, so a caller
-- only has to qualify a reference as much as the ambiguity requires --
-- "Pitchstone/gotchas", not the full path from the vault root.
create or replace function public.pitchstone_notes_matching(uid uuid, p_ref text)
returns setof public.pitchstone_notes
language sql
security invoker
set search_path = ''
stable
as $$
  with wanted as (
    select string_to_array(
      lower(regexp_replace(trim(p_ref), '\.md$', '', 'i')),
      '/'
    ) as segs
  )
  select n.*
    from public.pitchstone_notes n, wanted w
   where n.user_id = uid
     and case
       when array_length(w.segs, 1) = 1 then
         lower(n.title) = w.segs[1]
       else
         -- The note's own path, split the same way, must end with exactly
         -- these segments -- a segment-boundary match, not a substring one:
         -- "one/gotchas" must not match ".../someone/gotchas.md".
         (
           select array_agg(seg order by ord)
             from unnest(string_to_array(lower(regexp_replace(n.path, '\.md$', '', 'i')), '/'))
               with ordinality as t(seg, ord)
            where ord > array_length(string_to_array(n.path, '/'), 1) - array_length(w.segs, 1)
         ) = w.segs
     end
$$;

-- Called from within definer functions (an MCP path argument) and directly by
-- authenticated sessions (via pitchstone_resolve_links below); revoked from
-- anon and public and granted to authenticated for the latter. The uid
-- parameter is never client-controlled in the MCP path, and RLS on
-- pitchstone_notes backstops the direct-authenticated path exactly as it
-- already does for pitchstone_resolve_links.
revoke all on function public.pitchstone_notes_matching(uuid, text) from public, anon;
grant execute on function public.pitchstone_notes_matching(uuid, text) to authenticated;

-- Point every link at the note its target names -- or leave it unpointed
-- when the name is unclaimed *or* claimed by more than one note. Ambiguous
-- is not a coin flip: a link that could mean either of two notes is not
-- reliably about one of them, so it stays visibly unresolved (see the
-- editor's cm-wikilink--ambiguous, distinct from a genuinely unwritten one)
-- until it is qualified enough to pick one.
--
-- One pass now, not two: the previous version unpointed stale links and then
-- pointed fresh ones as separate UPDATEs, which is the same rule written
-- twice and a place for the two copies to drift apart.
create or replace function public.pitchstone_resolve_links(uid uuid default auth.uid())
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.pitchstone_links l
     set target_note_id = resolved.id
    from (
      select l2.id as link_id,
             case when count(m.id) = 1 then (array_agg(m.id))[1] else null end as id
        from public.pitchstone_links l2
        left join lateral public.pitchstone_notes_matching(uid, l2.target_title) m on true
       where l2.user_id = uid
       group by l2.id
    ) as resolved
   where l.id = resolved.link_id
     and l.target_note_id is distinct from resolved.id
$$;

-- The MCP path/title resolver, rebuilt on the same rule. Exact path is still
-- the fast, never-ambiguous path (it is the table's own unique key); anything
-- else -- a bare title or a folder-qualified reference -- goes through
-- pitchstone_notes_matching, and an ambiguous match is now an error a caller
-- can see and act on, rather than a silent, arbitrary pick.
create or replace function public.pitchstone_note_id_for(uid uuid, p_ref text)
returns uuid
language plpgsql
security invoker
set search_path = ''
stable
as $$
declare
  hit_count int;
  result uuid;
begin
  select id into result from public.pitchstone_notes
   where user_id = uid and path = p_ref;
  if result is not null then return result; end if;

  select id into result from public.pitchstone_notes
   where user_id = uid
     and (lower(path) = lower(p_ref) or lower(path) = lower(p_ref) || '.md');
  if result is not null then return result; end if;

  select count(*), (array_agg(id))[1] into hit_count, result
    from public.pitchstone_notes_matching(uid, p_ref);

  if hit_count > 1 then
    raise exception
      '% notes match "%" -- add enough of the folder path to name just one, e.g. "ProjectFolder/%"',
      hit_count, p_ref, p_ref
      using errcode = 'P0003';
  end if;

  return result; -- null when hit_count = 0; the one match when hit_count = 1
end;
$$;

revoke execute on function public.pitchstone_note_id_for(uuid, text) from public, anon, authenticated;
