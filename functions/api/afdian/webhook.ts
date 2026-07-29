import worker, { type Env } from '../../../worker/src/index';

interface PagesFunctionContext {
  request: Request;
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
}

interface AfdianWebhookPayload {
  data?: {
    type?: string;
    order?: {
      out_trade_no?: string;
      user_id?: string;
      plan_id?: string;
    };
  };
}

const AFDIAN_TEST_ORDER = {
  outTradeNo: '202106232138371083454010626',
  userId: 'adf397fe8374811eaacee52540025c377',
  planId: 'a45353328af911eb973052540025c377',
};

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

async function isAuthenticatedAfdianTest(request: Request, env: Env): Promise<boolean> {
  if (request.method !== 'POST') return false;

  const expectedToken = env.AFDIAN_WEBHOOK_TOKEN?.trim() ?? '';
  const suppliedToken = new URL(request.url).searchParams.get('token');
  if (!expectedToken || !tokenMatches(suppliedToken, expectedToken)) return false;

  try {
    const body = await request.clone().json() as AfdianWebhookPayload;
    const order = body.data?.order;
    // 爱发电测试回调的附加字段可能调整；固定订单、用户和套餐三元组才是稳定标识。
    // 私密 token 仍必须匹配，并且该分支只返回确认，不写 D1、不增加次数。
    return body.data?.type === 'order'
      && order?.out_trade_no === AFDIAN_TEST_ORDER.outTradeNo
      && order.user_id === AFDIAN_TEST_ORDER.userId
      && order.plan_id === AFDIAN_TEST_ORDER.planId;
  } catch {
    return false;
  }
}

/**
 * Cloudflare Pages 同域爱发电回调接口。
 * Worker 会校验私有 token，并通过爱发电 query-order API 回查真实订单。
 * 爱发电官方的固定测试订单仅用于连通性检查，不写入 D1，也不增加次数。
 */
export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  if (await isAuthenticatedAfdianTest(context.request, context.env)) {
    return Response.json({ ec: 200, em: '' }, {
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  }

  return worker.fetch(context.request, context.env, {
    waitUntil: promise => context.waitUntil(promise),
  });
}
