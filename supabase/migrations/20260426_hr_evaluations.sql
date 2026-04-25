-- HR Evaluations: đánh giá nhân sự theo kỳ (tháng/quý)
CREATE TABLE IF NOT EXISTS hr_evaluations (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email        TEXT NOT NULL,
  period       TEXT NOT NULL,            -- '2026-04' (tháng) hoặc '2026-Q1' (quý)
  kpi_percent  NUMERIC DEFAULT 0,        -- % KPI (tự tính từ doanh thu/target)
  quality      INT DEFAULT 0,            -- 1-5 sao (leader đánh giá)
  attitude     INT DEFAULT 0,            -- 1-5 sao (leader đánh giá)
  total_score  NUMERIC DEFAULT 0,        -- KPI*0.4 + quality*0.3 + attitude*0.3 (scale 5)
  grade        TEXT DEFAULT 'pending',   -- excellent/good/average/weak/pending
  note         TEXT,                     -- nhận xét leader
  evaluated_by TEXT,                     -- email leader đánh giá
  evaluated_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (email, period)
);

CREATE INDEX IF NOT EXISTS idx_hr_eval_period ON hr_evaluations(period);
CREATE INDEX IF NOT EXISTS idx_hr_eval_email ON hr_evaluations(email);
