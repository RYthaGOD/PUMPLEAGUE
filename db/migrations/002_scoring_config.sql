CREATE TABLE IF NOT EXISTS scoring_config (
  metric TEXT PRIMARY KEY,
  weight REAL NOT NULL,
  description TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO scoring_config (metric, weight, description) VALUES
  ('fees', 0.30, 'Fees generated'),
  ('holders', 0.25, 'Unique holders'),
  ('volume', 0.20, '24h Volume'),
  ('stability', 0.15, 'Price stability'),
  ('growth', 0.10, 'Growth rate');
