import { md5 } from '@noble/hashes/legacy.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { getWalletCredits, type D1Database } from './storage';

export interface BillingEnv {
  DB?: D1Database;
  AFDIAN_API_TOKEN?: string;
  AFDIAN_WEBHOOK_TOKEN?: string;
  AFDIAN_USER_ID?: string;
  AFDIAN_PACKAGE_1_PLAN_ID?: string;
  AFDIAN_PACKAGE_1_SKU_ID?: string;
  AFDIAN_PACKAGE_3_PLAN_ID?: string;
  AFDIAN_PACKAGE_3_SKU_ID?: string;
  AFDIAN_PACKAGE_10_PLAN_ID?: string;
  AFDIAN_PACKAGE_10_SKU_ID?: string;
}

const CLIENT_ID_RE = /^[a-zA-Z0-9._:-]{8,128}$/;
const AFDIAN_ID_RE = /^[a-f0-9]{32}$/i;
const CUSTOM_ORDER_PREFIX = 'ziwei:';
const AFDIAN_QUERY_ORDER_URL = 'https://afdian.com/api/open/query-order';
const MAX_QUERY_PAGES = 3;

const PACKAGE_AMOUNTS: Record<number, string> = {
  1: '1.88',
  3: '4.88',
  10: '12.88',
};

interface BillingSessionBody {
  clientId: string;
}

interface AfdianSku {
  sku_id?: string;
  count?: number;
}

interface AfdianOrder {
  out_trade_no?: string;
  custom_order_id?: string;
  user_id?: string;
  plan_id?: string;
  sku_detail?: AfdianSku[] | string;
  total_amount?: string;
  status?: number | string;
  product_type?: number | string;
}

interface AfdianWebhookBody {
  data?: {
    type?: string;
    order?: AfdianOrder;
  };
}

interface AfdianQueryOrderResponse {
  ec?: number;
  em?: string;
  data?: {
    list?: AfdianOrder[];
    total_page?: number;
  };
}

interface PackageIdentity {
  credits: 1 | 3 | 10;
  amount: string;
  planId: string;
  skuId: string;
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

function packageIdentity(env: BillingEnv, credits: number): PackageIdentity | null {
  if (credits === 1) {
    return {
      credits,
      amount: PACKAGE_AMOUNTS[credits],
      planId: env.AFDIAN_PACKAGE_1_PLAN_ID?.trim() ?? '',
      skuId: env.AFDIAN_PACKAGE_1_SKU_ID?.trim() ?? '',
    };
  }
  if (credits === 3) {
    return {
      credits,
      amount: PACKAGE_AMOUNTS[credits],
      planId: env.AFDIAN_PACKAGE_3_PLAN_ID?.trim() ?? '',
      skuId: env.AFDIAN_PACKAGE_3_SKU_ID?.trim() ?? '',
    };
  }
  if (credits === 10) {
    return {
      credits,
      amount: PACKAGE_AMOUNTS[credits],
      planId: env.AFDIAN_PACKAGE_10_PLAN_ID?.trim() ?? '',
      skuId: env.AFDIAN_PACKAGE_10_SKU_ID?.trim() ?? '',
    };
  }
  return null;
}

function isValidPackageIdentity(pkg: PackageIdentity | null): pkg is PackageIdentity {
  return Boolean(
    pkg
    && AFDIAN_ID_RE.test(pkg.planId)
    && AFDIAN_ID_RE.test(pkg.skuId),
  );
}

export function isBillingConfigured(env: BillingEnv): boolean {
  return Boolean(
    env.DB
    && env.AFDIAN_API_TOKEN?.trim()
    && (env.AFDIAN_WEBHOOK_TOKEN?.trim().length ?? 0) >= 32
    && env.AFDIAN_USER_ID?.trim()
    && isValidPackageIdentity(packageIdentity(env, 1))
    && isValidPackageIdentity(packageIdentity(env, 3))
    && isValidPackageIdentity(packageIdentity(env, 10)),
  );
}

function parseCustomOrderId(value: string): { clientId: string; credits: number } | null {
  if (!value.startsWith(CUSTOM_ORDER_PREFIX)) return null;
  const payload = value.slice(CUSTOM_ORDER_PREFIX.length);
  const separator = payload.lastIndexOf(':');
  if (separator <= 0) return null;

  const clientId = payload.slice(0, separator);
  const credits = Number.parseInt(payload.slice(separator + 1), 10);
  if (!isValidBillingClientId(clientId) || !PACKAGE_AMOUNTS[credits]) return null;
  return { clientId, credits };
}

function amountMatchesPackage(amount: string | undefined, expectedAmount: string): boolean {
  const parsed = Number(amount ?? '');
  return Number.isFinite(parsed) && parsed.toFixed(2) === expectedAmount;
}

function skuIds(order: AfdianOrder): string[] {
  let details = order.sku_detail;
  if (typeof details === 'string') {
    try {
      details = JSON.parse(details) as AfdianSku[];
    } catch {
      return [];
    }
  }
  if (!Array.isArray(details)) return [];
  return details
    .filter(item => Number(item?.count ?? 1) > 0)
    .map(item => item?.sku_id?.trim() ?? '')
    .filter(Boolean);
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

function tokenMatches(actual: string | null, expected: string): boolean {
  const actualBytes = new TextEncoder().encode(actual ?? '');
  const expectedBytes = new TextEncoder().encode(expected);
  const length = Math.max(actualBytes.length, expectedBytes.length);
  let mismatch = actualBytes.length ^ expectedBytes.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (actualBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }
  return mismatch === 0;
}

function signAfdianRequest(token: string, userId: string, params: string, timestamp: number): string {
  const payload = `${token}params${params}ts${timestamp}user_id${userId}`;
  return bytesToHex(md5(new TextEncoder().encode(payload)));
}

async function fetchAfdianOrderPage(
  env: BillingEnv,
  page: number,
): Promise<AfdianQueryOrderResponse> {
  const token = env.AFDIAN_API_TOKEN?.trim();
  const userId = env.AFDIAN_USER_ID?.trim();
  if (!token || !userId) throw new Error('AFDIAN_API_NOT_CONFIGURED');

  const params = JSON.stringify({ page });
  const timestamp = Math.floor(Date.now() / 1000);
  const response = await fetch(AFDIAN_QUERY_ORDER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      params,
      ts: timestamp,
      sign: signAfdianRequest(token, userId, params, timestamp),
    }),
  });
  if (!response.ok) throw new Error(`AFDIAN_QUERY_HTTP_${response.status}`);

  const payload = await response.json() as AfdianQueryOrderResponse;
  if (payload.ec !== 200 || !Array.isArray(payload.data?.list)) {
    throw new Error(`AFDIAN_QUERY_REJECTED_${payload.ec ?? 'UNKNOWN'}`);
  }
  return payload;
}

async function queryAfdianOrder(env: BillingEnv, outTradeNo: string): Promise<AfdianOrder | null> {
  for (let page = 1; page <= MAX_QUERY_PAGES; page += 1) {
    const payload = await fetchAfdianOrderPage(env, page);
    const order = payload.data?.list?.find(item => item.out_trade_no === outTradeNo);
    if (order) return order;

    const totalPages = Number(payload.data?.total_page ?? 1);
    if (!Number.isFinite(totalPages) || page >= totalPages) break;
  }
  return null;
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
  if (!isBillingConfigured(env)) return json({ ec: 503, em: 'billing unavailable' }, 503);

  const webhookToken = env.AFDIAN_WEBHOOK_TOKEN?.trim() ?? '';
  const suppliedToken = new URL(request.url).searchParams.get('token');
  if (!webhookToken || !tokenMatches(suppliedToken, webhookToken)) {
    return json({ ec: 401, em: 'unauthorized' }, 401);
  }

  const body = await parseJsonBody<AfdianWebhookBody>(request);
  const webhookOrder = body?.data?.order;
  if (!body || body.data?.type !== 'order' || !webhookOrder?.out_trade_no) {
    return json({ ec: 400, em: 'invalid payload' }, 400);
  }
  if (Number(webhookOrder.status) !== 2) return json({ ec: 200, em: '' });

  let order: AfdianOrder | null;
  try {
    order = await queryAfdianOrder(env, webhookOrder.out_trade_no);
  } catch (error) {
    console.error('Afdian query-order failed', error);
    return json({ ec: 503, em: 'order verification unavailable' }, 503);
  }
  if (!order) return json({ ec: 503, em: 'order not found' }, 503);

  const customOrder = parseCustomOrderId(order.custom_order_id ?? '');
  const expectedPackage = customOrder
    ? packageIdentity(env, customOrder.credits)
    : null;
  if (!customOrder || !isValidPackageIdentity(expectedPackage)) {
    return json({ ec: 422, em: 'invalid custom order' }, 422);
  }

  const validOrder = Number(order.status) === 2
    && Number(order.product_type) === 1
    && order.plan_id === expectedPackage.planId
    && skuIds(order).includes(expectedPackage.skuId)
    && amountMatchesPackage(order.total_amount, expectedPackage.amount);
  if (!validOrder) return json({ ec: 422, em: 'package identity mismatch' }, 422);

  const outTradeNo = order.out_trade_no ?? '';
  const purchaserId = order.user_id ?? '';
  if (!outTradeNo || !purchaserId) {
    return json({ ec: 422, em: 'unsupported order' }, 422);
  }

  const clientHash = await hashBillingClientId(customOrder.clientId);
  try {
    await env.DB!.prepare(`
      INSERT OR IGNORE INTO afdian_orders (
        out_trade_no,
        client_hash,
        custom_order_id,
        package_credits,
        total_amount,
        afdian_user_id,
        plan_id,
        sku_id,
        product_type,
        status,
        signature_verified,
        query_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
    `).bind(
      outTradeNo,
      clientHash,
      order.custom_order_id ?? '',
      expectedPackage.credits,
      order.total_amount ?? '',
      purchaserId,
      expectedPackage.planId,
      expectedPackage.skuId,
      Number(order.product_type),
      Number(order.status),
    ).run();
  } catch (error) {
    console.error('Afdian order persistence failed', error);
    return json({ ec: 503, em: 'temporary database error' }, 503);
  }

  return json({ ec: 200, em: '' });
}

export function buildAfdianCustomOrderId(clientId: string, credits: number): string {
  if (!isValidBillingClientId(clientId) || !PACKAGE_AMOUNTS[credits]) {
    throw new Error('INVALID_PURCHASE');
  }
  return `${CUSTOM_ORDER_PREFIX}${clientId}:${credits}`;
}
