-- ═════════════════════════════════════════════════════════════════
-- Protect revenue_expected across DELETE + INSERT cycles.
--
-- The scraper does: load exp → DELETE all rows for date → INSERT new rows
-- App-level merge handles most cases, but if code version mismatches
-- (cron timing vs deploy), exp can be lost.
--
-- Solution: temp table stores exp before DELETE, INSERT trigger reads it back.
-- ═════════════════════════════════════════════════════════════════

-- Temp storage for revenue_expected during DELETE+INSERT cycles
CREATE TABLE IF NOT EXISTS _exp_backup (
  channel text NOT NULL,
  source text NOT NULL,
  period_from date NOT NULL,
  revenue_expected numeric DEFAULT 0,
  saved_at timestamptz DEFAULT now(),
  PRIMARY KEY (channel, source, period_from)
);

-- BEFORE DELETE: save non-zero exp to backup
CREATE OR REPLACE FUNCTION backup_revenue_expected()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.revenue_expected IS NOT NULL AND OLD.revenue_expected > 0 THEN
    INSERT INTO _exp_backup (channel, source, period_from, revenue_expected)
    VALUES (OLD.channel, OLD.source, OLD.period_from, OLD.revenue_expected)
    ON CONFLICT (channel, source, period_from)
    DO UPDATE SET revenue_expected = EXCLUDED.revenue_expected, saved_at = now();
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_backup_exp_before_delete ON sales_sync;
CREATE TRIGGER trg_backup_exp_before_delete
  BEFORE DELETE ON sales_sync
  FOR EACH ROW
  EXECUTE FUNCTION backup_revenue_expected();

-- AFTER INSERT: restore exp from backup if new row has exp=0
CREATE OR REPLACE FUNCTION restore_revenue_expected()
RETURNS TRIGGER AS $$
DECLARE
  saved_exp numeric;
BEGIN
  IF NEW.revenue_expected IS NULL OR NEW.revenue_expected = 0 THEN
    SELECT revenue_expected INTO saved_exp
    FROM _exp_backup
    WHERE channel = NEW.channel
      AND source = NEW.source
      AND period_from = NEW.period_from
      AND saved_at > now() - interval '5 minutes';  -- only recent backups

    IF saved_exp IS NOT NULL AND saved_exp > 0 THEN
      UPDATE sales_sync
      SET revenue_expected = saved_exp
      WHERE channel = NEW.channel
        AND source = NEW.source
        AND period_from = NEW.period_from
        AND period_to = NEW.period_to;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_restore_exp_after_insert ON sales_sync;
CREATE TRIGGER trg_restore_exp_after_insert
  AFTER INSERT ON sales_sync
  FOR EACH ROW
  EXECUTE FUNCTION restore_revenue_expected();

-- Clean old backups periodically (keep only last 1 hour)
-- Can be called by cron or manually
CREATE OR REPLACE FUNCTION clean_exp_backup()
RETURNS void AS $$
BEGIN
  DELETE FROM _exp_backup WHERE saved_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql;
