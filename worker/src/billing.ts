import type { D1Database } from './storage';

export interface BillingEnv {
  DB?: D1Database;
}

const CLIENT_ID_RE = /^[a-zA-Z0-9._:-]{8,128}$/;
const CUSTOM_ORDER_PREFIX = 'ziwei:';

const AFDIAN_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwwdaCg1Bt+UKZKs0R54y
lYnuANma49IpgoOwNmk3a0rhg/PQuhUJ0EOZSowIC44l0K3+fqGns3Ygi4AfmEfS
4EKbdk1ahSxu7Zkp2rHMt+R9GarQFQkwSS/5x1dYiHNVMiR8oIXDgjmvxuNes2Cr
8fw9dEF0xNBKdkKgG2qAawcN1nZrdyaKWtPVT9m2Hl0ddOO9thZmVLFOb9NVzgYf
jEgI+KWX6aY19Ka/ghv/L4t1IXmz9pctablN5S0CRWpJW3Cn0k6zSXgjVdKm4uN7
jRlgSRaf/Ind46vMCm3N2sgwxu/g3bnooW+db0iLo13zzuvyn727Q3UDQ0MmZcEW
MQIDAQAB
-----END PUBLIC KEY-----`;

interface BillingSessionBody {
  clientId: string;
}

interface AfdianSkuDetail {
  sku_id?: string;
  count?: number;
  name?: string;
}

interface AfdianOrder {
  out_trade_no?: string;
  custom_order_id?: string;
  user_id?: string;
  plan_id?: string;
  total_amount?: string;
  status?: number;
  product_type?: number;
  sku_detail?: AfdianSkuDetail[];
}

interface AfdianWebhookBody {
  sign?: string;
  data?: {
    type?: string;
    sign?: string;
    order?: AfdianOrder;
  };
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function isValidClientId(clientId: string): boolean {
  return CLIENT_ID_RE.test(clientId);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function resolveSubjectKey(request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const userAgent = request.headers.get('User-Agent') || 'unknown';
  return `subject:${await sha256Hex(`${ip}|${userAgent}|`)}`;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function importAfdianPublicKey(): Promise<CryptoKey> {
  const der = AFDIAN_PUBLIC_KEY_PEM
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '');
  const bytes = base64ToBytes(der);
  return crypto.subtle.importKey(
    'spki',
    bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

async function verifyAfdianSignature(order: AfdianOrder, signature: string): Promise<boolean> {
  const outTradeNo = order.out_trade_no ?? '';
  const userId = order.user_id ?? '';
  const planId = order.plan_id ?? '';
  const totalAmount = order.total_amount ?? '';
  if (!outTradeNo || !userId || !totalAmount || !signature) return false;

  try {
    const key = await importAfdianPublicKey();
    const signString = `${outTradeNo}${userId}${planId}${totalAmount}`;
    return crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      base64ToBytes(signature),
      new TextEncoder().encode(signString),
    );
  } catch (error) {
    console.error('Afdian signature verification failed', error);
    return false;
  }
}

function packageCreditsForAmount(amount: string): number | null {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return null;
  const normalized = parsed.toFixed(2);
  if (normalized === '1.88') return 1;
  if (normalized === '4.88') return 3;
  if (normalized === '12.88') return 10;
  return null;
}

async function parseJsonBody<T>(request: Request, maxChars = 32_000): Promise<T | null> {
  try {
    const text = await request.text();
    if (!text || text.length > maxChars) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function handleBillingSession(request: Request, env: BillingEnv): Promise<Response> {
  if (request.method !== 'POST') return json({ error: '仅支持 POST 请求' }, 405);
  if (!env.DB) return json({ error: '次数数据库尚未配置' }, 503);

  const body = await parseJsonBody<BillingSessionBody>(request, 4_000);
  const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : '';
  if (!isValidClientId(clientId)) return json({ error: '客户端标识无效' }, 400);

  const db = env.DB;
  const clientHash = await sha256Hex(clientId);
  const subjectKey = await resolveSubjectKey(request);
  const previous = await db.prepare(`
    SELECT subject_key
    FROM billing_clients
    WHERE client_hash = ?
    LIMIT 1
  `).bind(clientHash).first<{ subject_key: string }>();

  const statements = [
    db.prepare(`
      INSERT INTO ai_clients (client_id)
      VALUES (?)
      ON CONFLICT(client_id) DO NOTHING
    `).bind(subjectKey),
    db.prepare(`
      INSERT INTO billing_wallets (client_hash, credits)
      VALUES (?, 0)
      ON CONFLICT(client_hash) DO NOTHING
    `).bind(clientHash),
  ];

  if (previous?.subject_key && previous.subject_key !== subjectKey) {
    statements.push(
      db.prepare(`
        UPDATE ai_clients
        SET credits = credits + COALESCE((
              SELECT credits FROM ai_clients WHERE client_id = ?
            ), 0),
            updated_at = CURRENT_TIMESTAMP
        WHERE client_id = ?
      `).bind(previous.subject_key, subjectKey),
      db.prepare(`
        UPDATE ai_clients
        SET credits = 0, updated_at = CURRENT_TIMESTAMP
        WHERE client_id = ?
      `).bind(previous.subject_key),
    );
  }

  statements.push(
    db.prepare(`
      UPDATE ai_clients
      SET credits = credits + COALESCE((
            SELECT credits FROM billing_wallets WHERE client_hash = ?
          ), 0),
          updated_at = CURRENT_TIMESTAMP
      WHERE client_id = ?
    `).bind(clientHash, subjectKey),
    db.prepare(`
      UPDATE billing_wallets
      SET credits = 0, updated_at = CURRENT_TIMESTAMP
      WHERE client_hash = ?
    `).bind(clientHash),
    db.prepare(`
      INSERT INTO billing_clients (client_hash, subject_key, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(client_hash) DO UPDATE SET
        subject_key = excluded.subject_key,
        updated_at = CURRENT_TIMESTAMP
    `).bind(clientHash, subjectKey),
  );

  try {
    await db.batch(statements);
  } catch (error) {
    console.error('Billing session sync failed', error);
    return json({ error: '付费次数同步失败，请稍后重试' }, 503);
  }

  const row = await db.prepare(`
    SELECT credits
    FROM ai_clients
    WHERE client_id = ?
    LIMIT 1
  `).bind(subjectKey).first<{ credits: number }>();

  return json({
    ok: true,
    paidCredits: Math.max(0, Number(row?.credits ?? 0)),
  });
}

export async function handleAfdianWebhook(request: Request, env: BillingEnv): Promise<Response> {
  if (request.method !== 'POST') return json({ ec: 405, em: 'method not allowed' }, 405);
  if (!env.DB) return json({ ec: 503, em: 'database unavailable' }, 503);

  const body = await parseJsonBody<AfdianWebhookBody>(request);
  const order = body?.data?.order;
  if (!body || body.data?.type !== 'order' || !order) {
    return json({ ec: 400, em: 'invalid payload' }, 400);
  }

  const signature = body.sign ?? body.data?.sign ?? '';
  if (!(await verifyAfdianSignature(order, signature))) {
    return json({ ec: 401, em: 'invalid signature' }, 401);
  }

  if (order.status !== 2) {
    return json({ ec: 200, em: '' });
  }

  const customOrderId = order.custom_order_id ?? '';
  if (!customOrderId.startsWith(CUSTOM_ORDER_PREFIX)) {
    return json({ ec: 200, em: '' });
  }

  const clientId = customOrderId.slice(CUSTOM_ORDER_PREFIX.length);
  if (!isValidClientId(clientId)) {
    return json({ ec: 422, em: 'invalid custom_order_id' }, 422);
  }

  const outTradeNo = order.out_trade_no ?? '';
  const userId = order.user_id ?? '';
  const planId = order.plan_id ?? '';
  const totalAmount = order.total_amount ?? '';
  const packageCredits = packageCreditsForAmount(totalAmount);
  if (!outTradeNo || !userId || packageCredits === null) {
    return json({ ec: 422, em: 'unsupported order' }, 422);
  }

  const clientHash = await sha256Hex(clientId);
  try {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO afdian_orders (
        out_trade_no,
        client_hash,
        custom_order_id,
        package_credits,
        total_amount,
        afdian_user_id,
        plan_id,
        product_type,
        status,
        signature_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      outTradeNo,
      clientHash,
      customOrderId,
      packageCredits,
      totalAmount,
      userId,
      planId,
      typeof order.product_type === 'number' ? order.product_type : null,
      order.status,
    ).run();
  } catch (error) {
    console.error('Afdian order persistence failed', error);
    return json({ ec: 503, em: 'temporary database error' }, 503);
  }

  return json({ ec: 200, em: '' });
}

export function buildAfdianCustomOrderId(clientId: string): string {
  if (!isValidClientId(clientId)) throw new Error('INVALID_CLIENT_ID');
  return `${CUSTOM_ORDER_PREFIX}${clientId}`;
}
