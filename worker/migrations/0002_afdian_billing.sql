-- 爱发电自动充值：稳定浏览器身份、待领取钱包、订单幂等记录。
-- 付费额度先进入 billing_wallets，再由 /api/billing/session 同步到当前 ai_clients subject。

CREATE TABLE IF NOT EXISTS billing_clients (
  client_hash TEXT PRIMARY KEY,
  subject_key TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_clients_subject
  ON billing_clients(subject_key);

CREATE TABLE IF NOT EXISTS billing_wallets (
  client_hash TEXT PRIMARY KEY,
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS afdian_orders (
  out_trade_no TEXT PRIMARY KEY,
  client_hash TEXT NOT NULL,
  custom_order_id TEXT NOT NULL,
  package_credits INTEGER NOT NULL CHECK (package_credits > 0),
  total_amount TEXT NOT NULL,
  afdian_user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL DEFAULT '',
  product_type INTEGER,
  status INTEGER NOT NULL,
  signature_verified INTEGER NOT NULL DEFAULT 1,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_afdian_orders_client
  ON afdian_orders(client_hash, received_at);
