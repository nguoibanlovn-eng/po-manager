-- ═════════════════════════════════════════════════════════════════
-- SSC inventory sync cron — 3 times per day
--
-- Calls /api/cron/sync-ssc to sync SSC fulfillment inventory.
-- Runs Nhanh product sync first (fresh stock_kho_tru), then SSC.
--
-- Schedule: 08:00, 14:00, 20:00 VN (01:00, 07:00, 13:00 UTC)
-- ═════════════════════════════════════════════════════════════════

select cron.unschedule('po-ssc-sync')
where exists (select 1 from cron.job where jobname = 'po-ssc-sync');

select cron.schedule(
  'po-ssc-sync',
  '0 1,7,13 * * *',   -- 01:00, 07:00, 13:00 UTC = 08:00, 14:00, 20:00 VN
  $$
  select net.http_post(
    url := 'https://quanly.lovu.vn/api/cron/sync-ssc',
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
