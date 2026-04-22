-- ═════════════════════════════════════════════════════════════════
-- Revenue sync cron — every 2 hours
--
-- Calls /api/cron/sync-revenue to keep dashboard revenue updated
-- throughout the day (report scraper: today + yesterday).
-- The full daily-sync still runs once at 01:00 VN.
--
-- Schedule: every even hour UTC (00,02,04,...22) = VN 07,09,11,...05
-- ═════════════════════════════════════════════════════════════════

select cron.unschedule('po-revenue-sync')
where exists (select 1 from cron.job where jobname = 'po-revenue-sync');

select cron.schedule(
  'po-revenue-sync',
  '0 */2 * * *',   -- every 2 hours
  $$
  select net.http_post(
    url := 'https://quanly.lovu.vn/api/cron/sync-revenue',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);

-- Verify: select * from cron.job;
