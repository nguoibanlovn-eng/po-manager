import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load env
const envPath = resolve(process.cwd(), ".env.local");
const envText = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const now = new Date().toISOString();

// 1. Delete old data
const { error: delErr } = await db.from("launch_plan").delete().neq("id", "00000000-0000-0000-0000-000000000000");
if (delErr) { console.error("Delete error:", delErr.message); process.exit(1); }
console.log("Deleted old launch plans.");

const plans = [
  // ═══ ĐANG LAUNCH — 4 SP ═══
  {
    sku: "MHB-301", product_name: "Máy hút bụi cầm tay V12 Pro",
    stage: "LAUNCHED", launch_date: "2026-03-15",
    channels: "Facebook,TikTok Shop,Shopee", note: "SP chủ lực Q2",
    created_by: "lehaivu01@gmail.com", created_at: now, updated_at: now,
    metrics: {
      product_type: "long",
      phase1: { horizon: "long", customer: "Hộ gia đình, căn hộ chung cư 25-45 tuổi", pain_point: "Bụi mịn, lông thú cưng, thời gian dọn nhanh" },
      competitors: "Xiaomi G10 2.5tr · Dyson 8tr · Dreame V12 3.5tr",
      channels_selected: ["Facebook", "TikTok Shop", "Shopee"],
      phase3: { sell_price: 1890000, sell_price_2: 1690000, cost: 520000 },
      pricing: { cost: 520000, sell_price: 1890000 },
      phase4: { channels: { Facebook: 200, "TikTok Shop": 350, Shopee: 150 }, stock_qty: 2000, months: 6, deadline: "2026-09-15", price_from: 1690000, price_to: 1890000 },
      actual: { Facebook: 145, "TikTok Shop": 280, Shopee: 95 },
      phase2: { drive_link: "https://drive.google.com/drive/folders/abc123", assignees: "Minh, Lan" },
      content: { drive_link: "https://drive.google.com/drive/folders/abc123", assignees: "Minh, Lan" },
      customer: { group: "Hộ gia đình, căn hộ chung cư", pain_point: "Bụi mịn, lông thú cưng" },
      listings: { Facebook: { links: ["https://fb.com/mhb301"], done: true }, "TikTok Shop": { links: ["https://tiktok.com/mhb301"], done: true }, Shopee: { links: ["https://shopee.vn/mhb301"], done: true } },
      sales_target: { stock_qty: 2000, months: 6, channel_split: { Facebook: 200, "TikTok Shop": 350, Shopee: 150 }, confirmed: true },
    },
  },
  {
    sku: "QAK-205", product_name: "Quạt điều hoà mini Arctic 2026",
    stage: "LAUNCHED", launch_date: "2026-04-01",
    channels: "Facebook,TikTok Shop,Shopee,Web/B2B", note: "Hàng mùa hè — push mạnh tháng 4-5",
    created_by: "lehaivu01@gmail.com", created_at: now, updated_at: now,
    metrics: {
      product_type: "short",
      phase1: { horizon: "short", customer: "Sinh viên, nhân viên VP, phòng trọ", pain_point: "Nóng, không đủ budget máy lạnh" },
      competitors: "Kangaroo 800k · Sunhouse 1.2tr",
      channels_selected: ["Facebook", "TikTok Shop", "Shopee", "Web/B2B"],
      phase3: { sell_price: 690000, sell_price_2: 590000, cost: 185000 },
      pricing: { cost: 185000, sell_price: 690000 },
      phase4: { channels: { Facebook: 300, "TikTok Shop": 500, Shopee: 200, "Web/B2B": 100 }, stock_qty: 3000, months: 3, deadline: "2026-07-01", price_from: 590000, price_to: 690000 },
      actual: { Facebook: 42, "TikTok Shop": 65, Shopee: 18, "Web/B2B": 5 },
      phase2: { drive_link: "https://drive.google.com/drive/folders/qak205", assignees: "Hà, Tuấn" },
      content: { drive_link: "https://drive.google.com/drive/folders/qak205", assignees: "Hà, Tuấn" },
      customer: { group: "Sinh viên, VP, phòng trọ", pain_point: "Nóng, budget thấp" },
      listings: { Facebook: { links: [], done: true }, "TikTok Shop": { links: [], done: true }, Shopee: { links: [], done: true }, "Web/B2B": { links: [], done: false } },
      sales_target: { stock_qty: 3000, months: 3, channel_split: { Facebook: 300, "TikTok Shop": 500, Shopee: 200, "Web/B2B": 100 }, confirmed: true },
    },
  },
  {
    sku: "BDR-112", product_name: "Bình đun siêu tốc 1.8L Inox",
    stage: "LAUNCHED", launch_date: "2026-02-20",
    channels: "Facebook,TikTok Shop,Shopee", note: "⚠ Cần đẩy mạnh — đang chậm target",
    created_by: "lehaivu01@gmail.com", created_at: now, updated_at: now,
    metrics: {
      product_type: "medium",
      phase1: { horizon: "medium", customer: "Gia đình, văn phòng nhỏ", pain_point: "Đun nước nhanh, an toàn, bền" },
      competitors: "Sunhouse 250k · Kangaroo 350k · Xiaomi 450k",
      channels_selected: ["Facebook", "TikTok Shop", "Shopee"],
      phase3: { sell_price: 399000, sell_price_2: 349000, cost: 95000 },
      pricing: { cost: 95000, sell_price: 399000 },
      phase4: { channels: { Facebook: 150, "TikTok Shop": 200, Shopee: 100 }, stock_qty: 1500, months: 4, deadline: "2026-06-20", price_from: 349000, price_to: 399000 },
      actual: { Facebook: 25, "TikTok Shop": 40, Shopee: 12 },
      phase2: { drive_link: "", assignees: "Lan" },
      content: { drive_link: "", assignees: "Lan" },
      customer: { group: "Gia đình, VP nhỏ", pain_point: "Đun nước nhanh, an toàn" },
      listings: { Facebook: { links: [], done: true }, "TikTok Shop": { links: [], done: true }, Shopee: { links: [], done: true } },
      sales_target: { stock_qty: 1500, months: 4, channel_split: { Facebook: 150, "TikTok Shop": 200, Shopee: 100 }, confirmed: true },
    },
  },
  {
    sku: "NLC-088", product_name: "Nồi lẩu điện đa năng 5L",
    stage: "LAUNCHED", launch_date: "2026-03-25",
    channels: "TikTok Shop,Shopee", note: "Vượt target TikTok!",
    created_by: "lehaivu01@gmail.com", created_at: now, updated_at: now,
    metrics: {
      product_type: "medium",
      phase1: { horizon: "medium", customer: "Gia đình trẻ 25-35, thích nấu lẩu tại nhà", pain_point: "Tiện lợi, đa năng, tiết kiệm" },
      competitors: "Sunhouse 400k · Lock&Lock 650k",
      channels_selected: ["TikTok Shop", "Shopee"],
      phase3: { sell_price: 550000, sell_price_2: 490000, cost: 135000 },
      pricing: { cost: 135000, sell_price: 550000 },
      phase4: { channels: { "TikTok Shop": 300, Shopee: 120 }, stock_qty: 1000, months: 5, deadline: "2026-08-25", price_from: 490000, price_to: 550000 },
      actual: { "TikTok Shop": 320, Shopee: 98 },
      phase2: { drive_link: "https://drive.google.com/nlc088", assignees: "Minh" },
      content: { drive_link: "https://drive.google.com/nlc088", assignees: "Minh" },
      customer: { group: "Gia đình trẻ 25-35", pain_point: "Tiện lợi nấu lẩu tại nhà" },
      listings: { "TikTok Shop": { links: ["https://tiktok.com/nlc088"], done: true }, Shopee: { links: ["https://shopee.vn/nlc088"], done: true } },
      sales_target: { stock_qty: 1000, months: 5, channel_split: { "TikTok Shop": 300, Shopee: 120 }, confirmed: true },
    },
  },

  // ═══ CHỜ LAUNCHING — 3 SP ═══
  {
    sku: "RBC-450", product_name: "Robot hút bụi lau nhà R450",
    stage: "READY", launch_date: null,
    channels: "Facebook,TikTok Shop,Shopee,Web/B2B", note: "Chờ hoàn thiện content video",
    created_by: "lehaivu01@gmail.com", created_at: now, updated_at: now,
    metrics: {
      product_type: "long",
      phase1: { horizon: "long", customer: "Gia đình trung-cao cấp, căn hộ >60m²", pain_point: "Không có thời gian dọn nhà hàng ngày" },
      competitors: "Ecovacs 5tr · Roborock 7tr · Xiaomi 3.5tr",
      channels_selected: ["Facebook", "TikTok Shop", "Shopee", "Web/B2B"],
      phase3: { sell_price: 3290000, sell_price_2: 2990000, cost: 980000 },
      pricing: { cost: 980000, sell_price: 3290000 },
      customer: { group: "Gia đình trung-cao cấp", pain_point: "Không có thời gian dọn nhà" },
      listings: { Facebook: { links: [], done: true }, "TikTok Shop": { links: [], done: false }, Shopee: { links: [], done: true }, "Web/B2B": { links: [], done: false } },
    },
  },
  {
    sku: "MXS-077", product_name: "Máy xay sinh tố cầm tay 600ml",
    stage: "READY", launch_date: null,
    channels: "TikTok Shop,Shopee", note: "Hàng mới về — cần pricing + content",
    created_by: "lehaivu01@gmail.com", created_at: now, updated_at: now,
    metrics: {
      product_type: "medium",
      phase1: { horizon: "medium", customer: "Dân văn phòng, gym, eat clean", pain_point: "Xay nhanh, mang đi được, dễ rửa" },
      channels_selected: ["TikTok Shop", "Shopee"],
      phase3: { sell_price: 0, sell_price_2: 0, cost: 68000 },
      pricing: { cost: 68000, sell_price: 0 },
      customer: { group: "Dân VP, gym, eat clean", pain_point: "Xay nhanh, portable" },
      listings: {},
    },
  },
  {
    sku: "DEN-033", product_name: "Đèn bàn LED chống cận USB-C",
    stage: "DRAFT", launch_date: null,
    channels: "Facebook,TikTok Shop", note: "Mới tạo — cần bổ sung thông tin",
    created_by: "lehaivu01@gmail.com", created_at: now, updated_at: now,
    metrics: {
      product_type: "short",
      phase1: { horizon: "short", customer: "Học sinh, sinh viên, WFH", pain_point: "Mỏi mắt khi học/làm việc ban đêm" },
      channels_selected: ["Facebook", "TikTok Shop"],
      pricing: { cost: 45000, sell_price: 0 },
      customer: { group: "Học sinh, sinh viên, WFH", pain_point: "Mỏi mắt ban đêm" },
      listings: {},
    },
  },

  // ═══ HOÀN TẤT — 2 SP ═══
  {
    sku: "QDH-190", product_name: "Quạt điều hoà hơi nước 40L",
    stage: "COMPLETED", launch_date: "2025-05-10",
    channels: "Facebook,TikTok Shop,Shopee", note: "Hoàn thành mùa hè 2025",
    created_by: "lehaivu01@gmail.com", created_at: now, updated_at: now,
    metrics: {
      product_type: "short",
      phase1: { horizon: "short", customer: "Hộ gia đình, cửa hàng", pain_point: "Giải nhiệt mùa hè" },
      channels_selected: ["Facebook", "TikTok Shop", "Shopee"],
      phase3: { sell_price: 2490000, cost: 680000 },
      pricing: { cost: 680000, sell_price: 2490000 },
      phase4: { channels: { Facebook: 180, "TikTok Shop": 400, Shopee: 120 }, stock_qty: 700, months: 3 },
      actual: { Facebook: 195, "TikTok Shop": 420, Shopee: 135 },
      sales_target: { stock_qty: 700, months: 3, channel_split: { Facebook: 180, "TikTok Shop": 400, Shopee: 120 }, confirmed: true },
    },
  },
  {
    sku: "TSX-042", product_name: "Tai nghe Bluetooth TWS Pro",
    stage: "POSTPONED", launch_date: "2026-01-15",
    channels: "TikTok Shop", note: "Tạm hoãn — lỗi firmware, đợi batch mới",
    created_by: "lehaivu01@gmail.com", created_at: now, updated_at: now,
    metrics: {
      product_type: "medium",
      phase1: { horizon: "medium", customer: "Giới trẻ, dân công nghệ", pain_point: "Nghe nhạc, call chất lượng" },
      channels_selected: ["TikTok Shop"],
      phase3: { sell_price: 350000, cost: 72000 },
      pricing: { cost: 72000, sell_price: 350000 },
      phase4: { channels: { "TikTok Shop": 500 }, stock_qty: 500, months: 4 },
      actual: { "TikTok Shop": 85 },
    },
  },
];

const { data, error } = await db.from("launch_plan").insert(plans).select("id");
if (error) { console.error("Insert error:", error.message); process.exit(1); }
console.log(`✅ Inserted ${data.length} launch plans successfully!`);
console.log("  - 4 LAUNCHED (đang launch)");
console.log("  - 3 READY/DRAFT (chờ launching)");
console.log("  - 2 COMPLETED/POSTPONED (hoàn tất)");
