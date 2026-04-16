-- ═════════════════════════════════════════════════════════════════
-- Daily sync cron via Supabase pg_cron + pg_net
--
-- Calls https://<APP-DOMAIN>/api/cron/daily-sync every day at 01:00 VN
-- (18:00 UTC previous day). App runs Nhanh + FB syncs in parallel.
--
-- PREREQUISITES:
--   1. Deploy Next.js to a public URL (Vercel / self-hosted).
--   2. Replace <APP-DOMAIN> below with your actual domain.
--   3. Replace <CRON_SECRET> with the exact value in your .env.local.
--   4. Enable pg_cron + pg_net extensions in Supabase Dashboard:
--      Database → Extensions → search "pg_cron", "pg_net" → Enable.
-- ═════════════════════════════════════════════════════════════════

-- One-time: unschedule previous job if exists, then schedule fresh.
select cron.unschedule('po-daily-sync')
where exists (select 1 from cron.job where jobname = 'po-daily-sync');

select cron.schedule(
  'po-daily-sync',
  '0 18 * * *',   -- every day 18:00 UTC = 01:00 Asia/Ho_Chi_Minh
  $$
  select net.http_post(
    url := 'https://<APP-DOMAIN>/api/cron/daily-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 600000
  );
  $$
);

-- Verify with:  select * from cron.job;
-- View history: select * from cron.job_run_details order by start_time desc limit 10;
