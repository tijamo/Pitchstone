-- Live updates: let a signed-in Pitchstone tab hear about its own notes
-- changing, whoever changed them -- the app in another tab, another device,
-- or Claude through the MCP server, whose writes land in these same rows.
--
-- Only pitchstone_notes joins the publication. Links are derived from note
-- content and are rewritten by the same statement that saves it, so a note
-- event already implies "the links may have moved"; putting the link table on
-- the wire as well would say nothing new and would double the traffic.
alter publication supabase_realtime add table public.pitchstone_notes;

-- Default replica identity puts only the primary key in the WAL for a delete,
-- which is not enough for two things that matter here: Realtime cannot apply
-- this table's RLS policy to a delete it cannot see the user_id of, and a
-- subscription filtered on user_id cannot match it either. Full replica
-- identity carries the old row, so a delete is filtered like every other
-- event and never reaches another user's tab.
alter table public.pitchstone_notes replica identity full;
