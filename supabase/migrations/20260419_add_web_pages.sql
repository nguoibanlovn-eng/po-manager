-- Add 2 Facebook pages used for Web/App B2B marketing
-- These pages run FB Ads to drive traffic to lovu.vn and muagimuadi
-- Ad account IDs and fb_page_id should be updated with actual values

INSERT INTO pages (page_id, page_name, platform, is_active, nhanh_id, ad_account_id, fb_page_id)
VALUES
  ('web-muagimuadi', 'Muagimuadi by Lỗ Vũ', 'web', true,
   'https://lovu.vn,WEB - Muagimuadi', NULL, NULL),
  ('web-velasboost', 'velasboost', 'web', true,
   'https://velasboost.vn', NULL, NULL)
ON CONFLICT (page_id) DO UPDATE SET
  page_name = EXCLUDED.page_name,
  platform = EXCLUDED.platform,
  is_active = EXCLUDED.is_active,
  nhanh_id = EXCLUDED.nhanh_id;

-- NOTE: After running this migration, update ad_account_id and fb_page_id
-- with actual Facebook values from the ads accounts:
-- UPDATE pages SET ad_account_id = 'act_XXXXX', fb_page_id = 'YYYYY' WHERE page_id = 'web-muagimuadi';
-- UPDATE pages SET ad_account_id = 'act_ZZZZZ', fb_page_id = 'WWWWW' WHERE page_id = 'web-velasboost';
