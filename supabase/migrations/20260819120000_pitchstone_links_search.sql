-- Pitchstone Phase 3: links, tags, and search actually get written.
--
-- pitchstone_resolve_links (from the base schema) only ever re-pointed links
-- that already existed; nothing wrote a note's outgoing links or tags in the
-- first place. pitchstone_save_note is the missing write path: the client
-- extracts links/tags/frontmatter with the shared TS parser (lib/markdown/
-- parse.ts) and this function persists all of it atomically, then resolves.
--
-- pitchstone_search_notes wraps the tsvector column the base schema already
-- built an index for. Matches are delimited with \x01/\x02 rather than HTML,
-- so the client can render highlights as React text instead of trusting
-- ts_headline's raw-content splicing inside dangerouslySetInnerHTML.

create or replace function public.pitchstone_save_note(
  p_note_id uuid,
  p_content text,
  p_tags text[],
  p_frontmatter jsonb,
  p_links jsonb -- [{"target": "...", "type": "wikilink" | "embed"}, ...]
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
     set content = p_content,
         tags = p_tags,
         frontmatter = p_frontmatter
   where id = p_note_id
     and user_id = uid
   returning * into result;

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

  return result;
end;
$$;

grant execute on function public.pitchstone_save_note(uuid, text, text[], jsonb, jsonb) to authenticated;

create or replace function public.pitchstone_search_notes(q text)
returns table(id uuid, path text, title text, snippet text)
language sql
security invoker
set search_path = ''
stable
as $$
  select n.id, n.path, n.title,
         ts_headline(
           'english', n.content, websearch_to_tsquery('english', q),
           E'MaxFragments=1, MaxWords=18, MinWords=6, ShortWord=3, StartSel=\x01, StopSel=\x02'
         ) as snippet
    from public.pitchstone_notes n
   where n.user_id = auth.uid()
     and n.search @@ websearch_to_tsquery('english', q)
   order by ts_rank(n.search, websearch_to_tsquery('english', q)) desc
   limit 40;
$$;

grant execute on function public.pitchstone_search_notes(text) to authenticated;
