-- Phase 0 — column additions discovered from the actual Google Sheet
-- (Run after 0001_initial_schema.sql.)

-- deployments: 12 extra columns present in the live sheet
alter table deployments
  add column if not exists items_summary        text,
  add column if not exists suggested_price      numeric default 0,
  add column if not exists assigned_channels    text,
  add column if not exists fb_note              text,
  add column if not exists sell_price_proposed  numeric default 0,
  add column if not exists ref_links            text,
  add column if not exists market_low           numeric default 0,
  add column if not exists market_high          numeric default 0,
  add column if not exists market_avg           numeric default 0,
  add column if not exists market_link_low      text,
  add column if not exists market_link_high     text,
  add column if not exists market_link_avg      text;

-- tasks: sheet has assigneeName + team + note (not priority/recurring)
alter table tasks
  add column if not exists assignee_name  text,
  add column if not exists team           text,
  add column if not exists note           text;

-- pages: sheet has fb_page_id distinct from page_id
alter table pages
  add column if not exists fb_page_id     text;

-- helper RPC: truncate an arbitrary table (used by migration script)
create or replace function truncate_table(tbl text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute format('truncate table %I cascade', tbl);
end;
$$;
revoke all on function truncate_table(text) from public;
