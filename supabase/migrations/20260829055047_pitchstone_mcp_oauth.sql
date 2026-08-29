-- Pitchstone OAuth: the MCP server now accepts an OAuth-issued Supabase JWT
-- (from the Tijamo-hub OAuth 2.1 server, via identity.tijamo.app) alongside
-- the existing pst_ personal tokens. A personal token still resolves through
-- the token_hash lookup below; an OAuth JWT arrives as the request's own
-- Authorization header, which PostgREST has already verified by the time this
-- function runs, so its owner is simply auth.uid() -- nothing to look up.
--
-- Every pitchstone_mcp_* function already routes exclusively through this one
-- function to resolve p_token to a user id, so this is the only change OAuth
-- support needs on the database side.
create or replace function public.pitchstone_token_user(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  if p_token is null then
    uid := auth.uid();
    if uid is null then
      raise exception 'invalid token' using errcode = '28000';
    end if;
    return uid;
  end if;

  if length(p_token) < 16 then
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
