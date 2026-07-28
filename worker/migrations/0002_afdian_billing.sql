-- 爱发电自动充值：稳定浏览器钱包 + 订单幂等记录。
-- 每个浏览器使用高熵 clientId；Webhook 将 custom_order_id 对应的额度写入稳定钱包。

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

-- 只有真正插入一张“新订单”时触发充值。
-- out_trade_no 为主键，因此爱发电重复推送同一订单不会重复加额度。
CREATE TRIGGER IF NOT EXISTS trg_afdian_order_credit
AFTER INSERT ON afdian_orders
BEGIN
  INSERT INTO billing_wallets (client_hash, credits, updated_at)
  VALUES (NEW.client_hash, NEW.package_credits, CURRENT_TIMESTAMP)
  ON CONFLICT(client_hash) DO UPDATE SET
    credits = billing_wallets.credits + NEW.package_credits,
    updated_at = CURRENT_TIMESTAMP;
END;
