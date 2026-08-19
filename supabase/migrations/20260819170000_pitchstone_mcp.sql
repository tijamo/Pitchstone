-- Pitchstone Phase 6: the database side of the MCP server.
--
-- The MCP server runs as a Netlify Function with no signed-in user, so
-- auth.uid() is null for everything it does. Two ways to bridge that: hand the
-- function a service-role key and trust it to filter every query by user_id,
-- or give it one narrow door into the database that derives the user from a
-- personal token. This takes the second.
--
-- The consequence is that Pitchstone needs no service-role key anywhere: the
-- function authenticates with the same public anon key the browser uses, and
-- the only thing it can reach with it is the pitchstone_mcp_* surface below.
-- A bug in the function cannot read another user's vault, because nothing it
-- holds can address one.
--
-- Every pitchstone_mcp_* function is security definer (so it can see past RLS),
-- takes the raw token as its first argument, and resolves it to a user id
-- through pitchstone_token_user before touching a row. The uid is never a
-- parameter the caller supplies.
--
-- Applied in two passes (pitchstone_mcp, then pitchstone_mcp_lock_internals,
-- once has_function_privilege showed the default privileges had re-granted the
-- internals). This file is the state both passes add up to, and replaying it
-- alone gets there.

-- Tokens --------------------------------------------------------------------

-- Only the SHA-256 of a token is stored, and the hashing happens in the
-- browser: the raw token is shown to its owner once, at creation, and is never
-- transmitted to or held by the database. Reading this table therefore gets
-- you nothing — the hash is not the credential, the preimage is.
create table if not exists public.pitchstone_api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Claude',
  token_hash text not null unique,
  -- The last few characters of the raw token, so a token can be told apart
  -- from its siblings in a list without being recoverable from it.
  token_hint text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint pitchstone_api_tokens_hash_valid check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint pitchstone_api_tokens_name_length check (length(name) between 1 and 64)
);

create index if not exists pitchstone_api_tokens_user_idx
  on public.pitchstone_api_tokens (user_id, created_at desc);

alter table public.pitchstone_api_tokens enable row level security;

drop policy if exists user_owns_pitchstone_api_tokens on public.pitchstone_api_tokens;
create policy user_owns_pitchstone_api_tokens on public.pitchstone_api_tokens
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Internals -----------------------------------------------------------------
-- Nothing below this line that takes a uid is callable by anon or
-- authenticated: a function that trusts a caller-supplied user id must only
-- ever be reachable from one that derived it itself.
--
-- Each revoke names anon and authenticated as well as public, because the
-- project's default privileges grant execute on every new function in this
-- schema to both — revoking from public alone leaves those grants standing.

-- Resolve a bearer token to its owner, and record that it was used. Raises
-- rather than returning null, so a caller cannot forget to check.
create or replace function public.pitchstone_token_user(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  if p_token is null or length(p_token) < 16 then
    raise exception 'invalid token' using errcode = '28000';
  end if;

  update public.pitchstone_api_tokens
     set last_used_at = now()
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
   returning user_id into uid;

  if uid is null then
    raise exception 'invalid token' using errcode = '28000';
  end if;

  return uid;
end;
$$;

revoke execute on function public.pitchstone_token_user(text) from public, anon, authenticated;

-- Find a note by exactly the path given, then by path ignoring case, then by
-- title. Forgiving on purpose: the MCP client is a language model naming a
-- note from memory, not a file picker returning a path it just read.
create or replace function public.pitchstone_note_id_for(uid uuid, p_ref text)
returns uuid
language sql
security invoker
set search_path = ''
stable
as $$
  select id from public.pitchstone_notes
   where user_id = uid
     and (path = p_ref
          or lower(path) = lower(p_ref)
          or lower(path) = lower(p_ref) || '.md'
          or lower(title) = lower(p_ref))
   order by case
     when path = p_ref then 0
     when lower(path) = lower(p_ref) then 1
     when lower(path) = lower(p_ref) || '.md' then 2
     else 3
   end
   limit 1
$$;

revoke execute on function public.pitchstone_note_id_for(uuid, text) from public, anon, authenticated;

-- pitchstone_reindex_note and pitchstone_save_note were written for a
-- signed-in browser and read auth.uid() themselves. The MCP path has no
-- auth.uid() to read, so the bodies move here, behind an explicit uid, and the
-- original two become thin wrappers. One implementation, two callers — the
-- alternative was a second copy of the derived-data write that could drift.
create or replace function public.pitchstone_reindex_note_as(
  uid uuid,
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

revoke execute on function public.pitchstone_reindex_note_as(uuid, uuid, text[], jsonb, jsonb) from public, anon, authenticated;

create or replace function public.pitchstone_save_note_as(
  uid uuid,
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
begin
  update public.pitchstone_notes
     set content = p_content
   where id = p_note_id
     and user_id = uid;

  if not found then
    raise exception 'note not found';
  end if;

  perform public.pitchstone_reindex_note_as(uid, p_note_id, p_tags, p_frontmatter, p_links);

  select * into result from public.pitchstone_notes where id = p_note_id;
  return result;
end;
$$;

revoke execute on function public.pitchstone_save_note_as(uuid, uuid, text, text[], jsonb, jsonb) from public, anon, authenticated;

create or replace function public.pitchstone_reindex_note(
  p_note_id uuid,
  p_tags text[],
  p_frontmatter jsonb,
  p_links jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.pitchstone_reindex_note_as(auth.uid(), p_note_id, p_tags, p_frontmatter, p_links);
$$;

create or replace function public.pitchstone_save_note(
  p_note_id uuid,
  p_content text,
  p_tags text[],
  p_frontmatter jsonb,
  p_links jsonb
)
returns public.pitchstone_notes
language sql
security definer
set search_path = ''
as $$
  select public.pitchstone_save_note_as(auth.uid(), p_note_id, p_content, p_tags, p_frontmatter, p_links);
$$;

-- Definer, not invoker: these are the browser's doors to the internals above,
-- and they are safe because the uid they pass is auth.uid(), never an argument.
-- Signed-in callers only; anon would pass a null uid and match nothing anyway,
-- but a door that leads nowhere is still better left shut.
revoke execute on function public.pitchstone_reindex_note(uuid, text[], jsonb, jsonb) from public, anon;
revoke execute on function public.pitchstone_save_note(uuid, text, text[], jsonb, jsonb) from public, anon;
grant execute on function public.pitchstone_reindex_note(uuid, text[], jsonb, jsonb) to authenticated;
grant execute on function public.pitchstone_save_note(uuid, text, text[], jsonb, jsonb) to authenticated;

-- The MCP surface ------------------------------------------------------------
-- One function per MCP tool, each authenticating for itself. These are the
-- only functions granted to anon, and the token is always the first argument,
-- so there is no way to add an operation and forget to check it.

create or replace function public.pitchstone_mcp_list_notes(
  p_token text,
  p_folder text default null,
  p_tag text default null,
  p_limit int default 200
)
returns table (
  path text,
  title text,
  tags text[],
  chars int,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.pitchstone_token_user(p_token);
  folder text := nullif(rtrim(coalesce(p_folder, ''), '/'), '');
begin
  return query
    select n.path, n.title, n.tags, length(n.content), n.created_at, n.updated_at
      from public.pitchstone_notes n
     where n.user_id = uid
       and (folder is null or n.path like folder || '/%')
       and (p_tag is null or lower(ltrim(p_tag, '#')) = any(n.tags))
     order by n.updated_at desc
     limit greatest(1, least(coalesce(p_limit, 200), 1000));
end;
$$;

create or replace function public.pitchstone_mcp_get_note(p_token text, p_path text)
returns table (
  path text,
  title text,
  content text,
  tags text[],
  frontmatter jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.pitchstone_token_user(p_token);
  note_id uuid := public.pitchstone_note_id_for(uid, p_path);
begin
  if note_id is null then
    raise exception 'no note matching %', p_path using errcode = 'P0002';
  end if;

  return query
    select n.path, n.title, n.content, n.tags, n.frontmatter, n.created_at, n.updated_at
      from public.pitchstone_notes n
     where n.id = note_id;
end;
$$;

create or replace function public.pitchstone_mcp_search(
  p_token text,
  p_query text,
  p_limit int default 20
)
returns table (path text, title text, snippet text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.pitchstone_token_user(p_token);
begin
  return query
    select n.path, n.title,
           ts_headline(
             'english', n.content, websearch_to_tsquery('english', p_query),
             'MaxFragments=2, MaxWords=24, MinWords=8, ShortWord=3, StartSel="**", StopSel="**"'
           )
      from public.pitchstone_notes n
     where n.user_id = uid
       and n.search @@ websearch_to_tsquery('english', p_query)
     order by ts_rank(n.search, websearch_to_tsquery('english', p_query)) desc
     limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

-- Create or overwrite a note at a path, then rebuild everything derived from
-- its text. Upsert rather than separate create and update tools: a memory
-- store is written to far more often than it is organised, and "put this here"
-- should not need the caller to know whether the note exists yet.
create or replace function public.pitchstone_mcp_write_note(
  p_token text,
  p_path text,
  p_content text,
  p_tags text[],
  p_frontmatter jsonb,
  p_links jsonb
)
returns table (path text, title text, created boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.pitchstone_token_user(p_token);
  note_id uuid;
  was_created boolean := false;
begin
  select n.id into note_id
    from public.pitchstone_notes n
   where n.user_id = uid and n.path = p_path;

  if note_id is null then
    insert into public.pitchstone_notes (user_id, path, content)
    values (uid, p_path, p_content)
    returning id into note_id;
    was_created := true;
    -- A note that did not exist a moment ago may be the target of links that
    -- have been dangling since before it did.
    perform public.pitchstone_reindex_note_as(uid, note_id, p_tags, p_frontmatter, p_links);
  else
    perform public.pitchstone_save_note_as(uid, note_id, p_content, p_tags, p_frontmatter, p_links);
  end if;

  return query
    select n.path, n.title, was_created, n.updated_at
      from public.pitchstone_notes n
     where n.id = note_id;
end;
$$;

create or replace function public.pitchstone_mcp_rename_note(
  p_token text,
  p_path text,
  p_to text
)
returns table (path text, title text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.pitchstone_token_user(p_token);
  note_id uuid := public.pitchstone_note_id_for(uid, p_path);
begin
  if note_id is null then
    raise exception 'no note matching %', p_path using errcode = 'P0002';
  end if;

  update public.pitchstone_notes n
     set path = p_to
   where n.id = note_id and n.user_id = uid;

  -- The title moved with the path, so links naming either name re-resolve.
  perform public.pitchstone_resolve_links(uid);

  return query
    select n.path, n.title from public.pitchstone_notes n where n.id = note_id;
end;
$$;

create or replace function public.pitchstone_mcp_delete_note(p_token text, p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.pitchstone_token_user(p_token);
  note_id uuid := public.pitchstone_note_id_for(uid, p_path);
  deleted text;
begin
  if note_id is null then
    raise exception 'no note matching %', p_path using errcode = 'P0002';
  end if;

  delete from public.pitchstone_notes n
   where n.id = note_id and n.user_id = uid
   returning n.path into deleted;

  -- Links into the deleted note are kept, and become unresolved.
  perform public.pitchstone_resolve_links(uid);
  return deleted;
end;
$$;

-- Source notes come back with their full text: the excerpt around each link is
-- cut by the same TypeScript that cuts it for the app's backlinks panel, so
-- the two cannot describe the same link differently.
create or replace function public.pitchstone_mcp_backlinks(p_token text, p_path text)
returns table (path text, title text, content text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.pitchstone_token_user(p_token);
  note_id uuid := public.pitchstone_note_id_for(uid, p_path);
begin
  if note_id is null then
    raise exception 'no note matching %', p_path using errcode = 'P0002';
  end if;

  return query
    select n.path, n.title, n.content
      from public.pitchstone_notes n
     where n.user_id = uid
       and exists (
         select 1 from public.pitchstone_links l
          where l.source_note_id = n.id
            and l.target_note_id = note_id
       )
     order by n.path;
end;
$$;

create or replace function public.pitchstone_mcp_tags(p_token text)
returns table (tag text, uses bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.pitchstone_token_user(p_token);
begin
  return query
    select t.tag, count(*)
      from public.pitchstone_notes n, unnest(n.tags) as t(tag)
     where n.user_id = uid
     group by t.tag
     order by count(*) desc, t.tag;
end;
$$;

-- Orientation in one call: how big the vault is, when it last changed, and
-- which links point at notes that have not been written yet — the last being
-- the closest thing a vault has to a to-do list.
create or replace function public.pitchstone_mcp_vault_info(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.pitchstone_token_user(p_token);
begin
  return jsonb_build_object(
    'notes', (select count(*) from public.pitchstone_notes where user_id = uid),
    'links', (select count(*) from public.pitchstone_links where user_id = uid),
    'tags', (select count(distinct t.tag) from public.pitchstone_notes n, unnest(n.tags) as t(tag)
              where n.user_id = uid),
    'last_updated', (select max(updated_at) from public.pitchstone_notes where user_id = uid),
    'folders', coalesce((
      select jsonb_agg(f order by f)
        from (select distinct regexp_replace(path, '/[^/]*$', '') as f
                from public.pitchstone_notes
               where user_id = uid and path like '%/%') folders
    ), '[]'::jsonb),
    'unwritten', coalesce((
      select jsonb_agg(distinct l.target_title)
        from public.pitchstone_links l
       where l.user_id = uid and l.target_note_id is null
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.pitchstone_mcp_list_notes(text, text, text, int) to anon, authenticated;
grant execute on function public.pitchstone_mcp_get_note(text, text) to anon, authenticated;
grant execute on function public.pitchstone_mcp_search(text, text, int) to anon, authenticated;
grant execute on function public.pitchstone_mcp_write_note(text, text, text, text[], jsonb, jsonb) to anon, authenticated;
grant execute on function public.pitchstone_mcp_rename_note(text, text, text) to anon, authenticated;
grant execute on function public.pitchstone_mcp_delete_note(text, text) to anon, authenticated;
grant execute on function public.pitchstone_mcp_backlinks(text, text) to anon, authenticated;
grant execute on function public.pitchstone_mcp_tags(text) to anon, authenticated;
grant execute on function public.pitchstone_mcp_vault_info(text) to anon, authenticated;
