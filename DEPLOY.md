# Deploy guide — PO Manager v7

## 1. Push code lên GitHub

```bash
# Kiểm tra .env.local KHÔNG bị commit (gitignore đã chặn sẵn)
git status | grep -i env
# → không thấy .env.local là OK

git add -A
git commit -m "Migrate gs.txt → Next.js + Supabase"
git push origin main
```

## 2. Tạo Vercel project

1. Vào https://vercel.com/new → chọn repo `po-manager`
2. Framework: **Next.js** (auto-detected)
3. Root directory: để mặc định (`/`)
4. Build cmd / output: để mặc định

### Env vars (quan trọng!)

Vercel → Project Settings → **Environment Variables** → paste toàn bộ
giá trị từ `.env.local` (KHÔNG paste từng cái một — dùng "Import
`.env`" hoặc copy cả file).

### Deploy

Bấm **Deploy**. Sau 1-2 phút, Vercel cho URL như `po-manager-xxx.vercel.app`.

## 3. ⚠ Vercel function timeout

Vercel có giới hạn thời gian mỗi API call:
- **Hobby (Free)**: 60 giây
- **Pro ($20/tháng)**: 300 giây (5 phút)

| Sync | Thời gian | Free OK? | Pro OK? |
|---|---|---|---|
| FB Page Insights (30d) | ~30s | ✅ | ✅ |
| FB Ads (7d) | ~30-60s | ⚠ sát | ✅ |
| Nhanh Sales | ~30-120s | ❌ | ✅ |
| Nhanh Products | ~60-120s | ❌ | ✅ |
| Nhanh Inventory | ~60-120s | ❌ | ✅ |
| Nhanh Customers | ~2-5 phút | ❌ | ⚠ timeout |
| Cron daily-sync (all) | ~5-10 phút | ❌ | ❌ |

**Khuyến nghị**:
- **Free tier**: chỉ dùng được FB Insights. Các sync khác cần chạy tay trên local (`npm run dev` rồi bấm trong `/admin-settings`).
- **Pro tier**: OK cho hầu hết; Customers sync + Cron daily cần chia nhỏ.
- **Self-host** (VPS $5-10/tháng): không giới hạn, cron dùng crontab Linux thẳng.

## 4. Supabase — enable pg_cron + pg_net

1. Supabase Dashboard → **Database** → **Extensions**
2. Search `pg_cron` → Enable
3. Search `pg_net` → Enable

## 5. Set up cron daily sync

Mở file `supabase/migrations/0005_cron_daily_sync.sql`, thay:

```
<APP-DOMAIN>   → po-manager-xxx.vercel.app (Vercel URL, không có https://)
<CRON_SECRET>  → giá trị CRON_SECRET trong Vercel env vars
```

Copy SQL đã thay → paste vào Supabase SQL Editor → Run.

Verify:
```sql
select * from cron.job;
select * from cron.job_run_details order by start_time desc limit 5;
```

## 6. Seed admin user + TikTok Shop tokens

### Admin user
```sql
insert into users (email, name, role, is_active) values
  ('admin@vuabanlo.vn', 'Lê Vũ (Admin)', 'ADMIN', true)
on conflict (email) do nothing;
```

### TikTok Shop (3 shops)
Paste seed data riêng — KHÔNG commit tokens vào git. Bạn có tokens trong
chat session trước; nếu mất, vào Google Apps Script cũ → Project
Settings → Script Properties để copy lại `TKTSHOP_TOKEN_<shop_id>` +
`TKTSHOP_REFRESH_<shop_id>` + `TKTSHOP_EXPIRES_<shop_id>` + `TKTSHOP_NAME_<shop_id>`
cho 3 shops, rồi:

```sql
insert into tktshop_shops (shop_id, name, access_token, refresh_token, expires_at) values
  ('<shop_id_1>', '<name>', '<access_token>', '<refresh_token>', <expires_unix>),
  ('<shop_id_2>', ...),
  ('<shop_id_3>', ...)
on conflict (shop_id) do nothing;
```

## 7. Test

1. Vào https://po-manager-xxx.vercel.app
2. Login bằng email admin → nhận OTP → đăng nhập
3. `/admin-settings` → thử sync (FB Insights sẽ chạy; sync lớn có thể timeout trên Free)
4. `/dash` → xem KPIs

## 8. Rotate credentials

Sau khi deploy xong, **đổi lại tất cả credentials đã gửi qua chat** (vì đã
lộ trong log AI assistant):
- Supabase: Settings → API → Reset service_role key
- Gmail: Revoke app password cũ, tạo mới
- Nhanh/FB/TikTok: regenerate tokens
- Cập nhật vào Vercel env vars

## 9. Self-host (nếu không dùng Vercel)

VPS Ubuntu:
```bash
git clone ... && cd po-manager
npm install
cp .env.example .env.local && vi .env.local  # điền creds
npm run build
pm2 start npm --name po-manager -- start
# pm2 startup  # để auto-start khi reboot

# Nginx reverse proxy → localhost:3000 + SSL qua Certbot
```

Cron daily sync qua `crontab -e`:
```
0 1 * * * curl -X POST https://yourdomain.com/api/cron/daily-sync \
  -H "Authorization: Bearer $CRON_SECRET"
```
