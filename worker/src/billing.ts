import { getWalletCredits, type D1Database } from './storage';

export interface BillingEnv {
  DB?: D1Database;
}

const CLIENT_ID_RE = /^[a-zA-Z0-9._:-]{8,128}$/;
const CUSTOM_ORDER_PREFIX = 'ziwei:';

const AFDIAN_PACKAGES: Record<string, { credits: number; amount: string }> = {
  '6f5e5c788a3511f1af625254001e7c00': { credits: 1, amount: '1.88' },
  'aa3926f88a3411f1aa295254001e7c00': { credits: 3, amount: '4.88' },
  'e4a616f28a5711f1a6115254001e7c00': { credits: 10, amount: '12.88' },
};

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

export function isValidBillingClientId(clientId: string): boolean {
  return CLIENT_ID_RE.test(clientId);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashBillingClientId(clientId: string): Promise<string> {
  if (!isValidBillingClientId(clientId)) throw new Error('INVALID_CLIENT_ID');
  return sha256Hex(clientId);
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

function resolvePackage(order: AfdianOrder): { credits: number; amount: string } | null {
  const planId = order.plan_id ?? '';
  const packageConfig = AFDIAN_PACKAGES[planId];
  if (!packageConfig) return null;

  const parsedAmount = Number(order.total_amount ?? '');
  if (!Number.isFinite(parsedAmount) || parsedAmount.toFixed(2) !== packageConfig.amount) {
    return null;
  }
  return packageConfig;
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
  if (!isValidBillingClientId(clientId)) return json({ error: '客户端标识无效' }, 400);

  const clientHash = await hashBillingClientId(clientId);
  try {
    await env.DB.prepare(`
      INSERT INTO billing_wallets (client_hash, credits)
      VALUES (?, 0)
      ON CONFLICT(client_hash) DO NOTHING
    `).bind(clientHash).run();

    return json({
      ok: true,
      paidCredits: await getWalletCredits(env.DB, clientHash),
    });
  } catch (error) {
    console.error('Billing session read failed', error);
    return json({ error: '付费次数查询失败，请稍后重试' }, 503);
  }
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
  if (!isValidBillingClientId(clientId)) {
    return json({ ec: 422, em: 'invalid custom_order_id' }, 422);
  }

  const outTradeNo = order.out_trade_no ?? '';
  const userId = order.user_id ?? '';
  const planId = order.plan_id ?? '';
  const totalAmount = order.total_amount ?? '';
  const packageConfig = resolvePackage(order);
  if (!outTradeNo || !userId || !packageConfig) {
    return json({ ec: 422, em: 'unsupported order' }, 422);
  }

  const clientHash = await hashBillingClientId(clientId);
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
      packageConfig.credits,
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
  if (!isValidBillingClientId(clientId)) throw new Error('INVALID_CLIENT_ID');
  return `${CUSTOM_ORDER_PREFIX}${clientId}`;
}
