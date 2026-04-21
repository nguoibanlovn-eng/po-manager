-- Add assignee columns to items table for damage ticket assignment
ALTER TABLE items ADD COLUMN IF NOT EXISTS damage_assignee text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS damage_assignee_name text;
