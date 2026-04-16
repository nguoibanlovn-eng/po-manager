-- R&D workflow: lưu state từng bước + thời gian hoàn thành + checklist

alter table rd_items
  add column if not exists rd_type            text default 'research',
  add column if not exists current_step       text,
  add column if not exists step_completed_at  jsonb default '{}'::jsonb,
  add column if not exists step_data          jsonb default '{}'::jsonb,
  add column if not exists checklists         jsonb default '{}'::jsonb;

-- Index cho filter nhanh
create index if not exists idx_rd_items_rd_type on rd_items(rd_type);
create index if not exists idx_rd_items_current_step on rd_items(current_step);
