export type AiMode = 'chart' | 'compatibility';
export type ChargedKind = 'none' | 'free' | 'credit' | 'wallet' | 'vip';

export interface D1RunResult {
  success?: boolean;
  meta?: {
    changes?: number;
  };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1RunResult>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

export interface ChargeResult {
  allowed: boolean;
  kind: ChargedKind;
  units: number;
  remainingFree?: number;
  remainingCredits?: number;
  walletClientHash?: string;
}

interface ClientRow {
  daily_date: string;
  daily_used: number;
  credits: number;
  vip_until: string | null;
}

interface CacheRow {
  response_text: string;
  expires_at: number;
}

interface WalletRow {
  credits: number;
}

function changes(result: D1RunResult): number {
  return typeof result.meta?.changes === 'number' ? result.meta.changes : 0;
}

export function dayKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

async function ensureClient(db: D1Database, clientId: string): Promise<void> {
  await db.prepare(`
    INSERT INTO ai_clients (client_id)
    VALUES (?)
    ON CONFLICT(client_id) DO NOTHING
  `).bind(clientId).run();
}

export async function getCachedResponse(
  db: D1Database,
  cacheKey: string,
  mode: AiMode,
  nowSeconds: number,
): Promise<string | null> {
  const row = await db.prepare(`
    SELECT response_text, expires_at
    FROM ai_cache
    WHERE cache_key = ? AND mode = ? AND expires_at > ?
    LIMIT 1
  `).bind(cacheKey, mode, nowSeconds).first<CacheRow>();

  return row?.response_text?.trim() ? row.response_text : null;
}

export async function saveCachedResponse(
  db: D1Database,
  cacheKey: string,
  mode: AiMode,
  responseText: string,
  expiresAt: number,
): Promise<void> {
  await db.prepare(`
    INSERT INTO ai_cache (cache_key, mode, response_text, expires_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      mode = excluded.mode,
      response_text = excluded.response_text,
      created_at = CURRENT_TIMESTAMP,
      expires_at = excluded.expires_at
  `).bind(cacheKey, mode, responseText, expiresAt).run();
}

export async function getWalletCredits(
  db: D1Database,
  walletClientHash: string,
): Promise<number> {
  const row = await db.prepare(`
    SELECT credits
    FROM billing_wallets
    WHERE client_hash = ?
    LIMIT 1
  `).bind(walletClientHash).first<WalletRow>();

  return Math.max(0, Number(row?.credits ?? 0));
}

export async function chargeQuota(
  db: D1Database,
  clientId: string,
  mode: AiMode,
  freeDailyLimit: number,
  compatibilityCreditCost: number,
  walletClientHash?: string,
  now = new Date(),
): Promise<ChargeResult> {
  await ensureClient(db, clientId);

  const row = await db.prepare(`
    SELECT daily_date, daily_used, credits, vip_until
    FROM ai_clients
    WHERE client_id = ?
    LIMIT 1
  `).bind(clientId).first<ClientRow>();

  const nowIso = now.toISOString();
  if (row?.vip_until && row.vip_until > nowIso) {
    return {
      allowed: true,
      kind: 'vip',
      units: 0,
      remainingFree: Math.max(0, freeDailyLimit - (row.daily_date === dayKey(now) ? row.daily_used : 0)),
      remainingCredits: walletClientHash
        ? await getWalletCredits(db, walletClientHash)
        : row.credits,
    };
  }

  const today = dayKey(now);
  const unitCost = mode === 'compatibility'
    ? Math.max(1, compatibilityCreditCost)
    : 1;
  const freeUpdate = await db.prepare(`
    UPDATE ai_clients
    SET
      daily_date = ?,
      daily_used = CASE WHEN daily_date = ? THEN daily_used + ? ELSE ? END,
      updated_at = CURRENT_TIMESTAMP
    WHERE client_id = ?
      AND (
        (daily_date <> ? AND ? <= ?)
        OR (daily_date = ? AND daily_used + ? <= ?)
      )
  `).bind(
    today,
    today,
    unitCost,
    unitCost,
    clientId,
    today,
    unitCost,
    freeDailyLimit,
    today,
    unitCost,
    freeDailyLimit,
  ).run();

  if (changes(freeUpdate) > 0) {
    const previousUsed = row?.daily_date === today ? row.daily_used : 0;
    return {
      allowed: true,
      kind: 'free',
      units: unitCost,
      remainingFree: Math.max(0, freeDailyLimit - previousUsed - unitCost),
      remainingCredits: walletClientHash
        ? await getWalletCredits(db, walletClientHash)
        : row?.credits ?? 0,
    };
  }

  if (walletClientHash) {
    const walletUpdate = await db.prepare(`
      UPDATE billing_wallets
      SET credits = credits - ?, updated_at = CURRENT_TIMESTAMP
      WHERE client_hash = ? AND credits >= ?
    `).bind(unitCost, walletClientHash, unitCost).run();

    if (changes(walletUpdate) > 0) {
      return {
        allowed: true,
        kind: 'wallet',
        units: unitCost,
        remainingFree: 0,
        remainingCredits: await getWalletCredits(db, walletClientHash),
        walletClientHash,
      };
    }
  }

  const creditUpdate = await db.prepare(`
    UPDATE ai_clients
    SET credits = credits - ?, updated_at = CURRENT_TIMESTAMP
    WHERE client_id = ? AND credits >= ?
  `).bind(unitCost, clientId, unitCost).run();

  if (changes(creditUpdate) > 0) {
    return {
      allowed: true,
      kind: 'credit',
      units: unitCost,
      remainingFree: 0,
      remainingCredits: Math.max(0, (row?.credits ?? unitCost) - unitCost),
    };
  }

  return {
    allowed: false,
    kind: 'none',
    units: 0,
    remainingFree: 0,
    remainingCredits: walletClientHash
      ? await getWalletCredits(db, walletClientHash)
      : row?.credits ?? 0,
  };
}

export async function refundQuota(
  db: D1Database,
  clientId: string,
  charge: ChargeResult,
  now = new Date(),
): Promise<void> {
  if (!charge.allowed || charge.kind === 'none' || charge.kind === 'vip') return;

  if (charge.kind === 'free') {
    const today = dayKey(now);
    await db.prepare(`
      UPDATE ai_clients
      SET daily_used = CASE
            WHEN daily_used >= ? THEN daily_used - ?
            ELSE 0
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE client_id = ? AND daily_date = ?
    `).bind(charge.units, charge.units, clientId, today).run();
    return;
  }

  if (charge.kind === 'wallet' && charge.walletClientHash) {
    await db.prepare(`
      INSERT INTO billing_wallets (client_hash, credits, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(client_hash) DO UPDATE SET
        credits = billing_wallets.credits + excluded.credits,
        updated_at = CURRENT_TIMESTAMP
    `).bind(charge.walletClientHash, charge.units).run();
    return;
  }

  if (charge.kind === 'credit') {
    await db.prepare(`
      UPDATE ai_clients
      SET credits = credits + ?, updated_at = CURRENT_TIMESTAMP
      WHERE client_id = ?
    `).bind(charge.units, clientId).run();
  }
}

export async function recordUsage(
  db: D1Database,
  clientId: string,
  mode: AiMode,
  cacheHit: boolean,
  charge: ChargeResult,
): Promise<void> {
  await db.prepare(`
    INSERT INTO ai_usage (client_id, mode, cache_hit, charged_kind, units)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    clientId,
    mode,
    cacheHit ? 1 : 0,
    cacheHit ? 'none' : charge.kind,
    cacheHit ? 0 : charge.units,
  ).run();
}

export async function purgeExpiredCache(db: D1Database, nowSeconds: number): Promise<void> {
  await db.prepare(`
    DELETE FROM ai_cache
    WHERE expires_at <= ?
  `).bind(nowSeconds).run();
}
