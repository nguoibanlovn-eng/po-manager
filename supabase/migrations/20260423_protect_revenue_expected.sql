-- ═════════════════════════════════════════════════════════════════
-- DB-level protection: prevent revenue_expected from being zeroed
-- out when it already has a positive value.
--
-- This runs INSIDE the database — independent of app code version.
-- Solves: cron running old code that doesn't merge expected values.
-- ═════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION protect_revenue_expected()
RETURNS TRIGGER AS $$
BEGIN
  -- If existing row has revenue_expected > 0 and new value is 0 or NULL,
  -- keep the existing value
  IF OLD.revenue_expected IS NOT NULL
     AND OLD.revenue_expected > 0
     AND (NEW.revenue_expected IS NULL OR NEW.revenue_expected = 0) THEN
    NEW.revenue_expected := OLD.revenue_expected;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_revenue_expected ON sales_sync;

CREATE TRIGGER trg_protect_revenue_expected
  BEFORE UPDATE ON sales_sync
  FOR EACH ROW
  EXECUTE FUNCTION protect_revenue_expected();
