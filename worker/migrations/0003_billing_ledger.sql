-- 付款审计与商品身份记录。
-- 必须在 0001_ai_billing_cache.sql、0002_afdian_billing.sql 之后执行。

ALTER TABLE afdian_orders
  ADD COLUMN sku_id TEXT NOT NULL DEFAULT '';

ALTER TABLE afdian_orders
  ADD COLUMN query_verified INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS billing_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_hash TEXT NOT NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  source TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, reference_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_ledger_client_created
  ON billing_ledger(client_hash, created_at DESC);

DROP TRIGGER IF EXISTS trg_afdian_order_credit;

-- 订单、钱包与审计流水在同一条 D1 语句中完成；重复订单受主键保护，不会重复充值。
CREATE TRIGGER trg_afdian_order_credit
AFTER INSERT ON afdian_orders
WHEN NEW.query_verified = 1
BEGIN
  INSERT INTO billing_wallets (client_hash, credits, updated_at)
  VALUES (NEW.client_hash, NEW.package_credits, CURRENT_TIMESTAMP)
  ON CONFLICT(client_hash) DO UPDATE SET
    credits = billing_wallets.credits + NEW.package_credits,
    updated_at = CURRENT_TIMESTAMP;

  INSERT INTO billing_ledger (
    client_hash,
    delta,
    balance_after,
    source,
    reference_id
  )
  SELECT
    NEW.client_hash,
    NEW.package_credits,
    credits,
    'afdian_order',
    NEW.out_trade_no
  FROM billing_wallets
  WHERE client_hash = NEW.client_hash;
END;
