import worker, { type Env } from '../../../worker/src/index';

interface PagesFunctionContext {
  request: Request;
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
}

interface WebhookResult {
  ec?: number;
}

interface StoredOrder {
  package_credits: number;
}

const ORDER_NUMBER_RE = /^\d{20,40}$/;
const MAX_FORM_CHARS = 4_096;

function tokenMatches(actual: string, expected: string): boolean {
  const actualBytes = new TextEncoder().encode(actual);
  const expectedBytes = new TextEncoder().encode(expected);
  const length = Math.max(actualBytes.length, expectedBytes.length);
  let mismatch = actualBytes.length ^ expectedBytes.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (actualBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }
  return mismatch === 0;
}

function htmlResponse(content: string, status = 200): Response {
  return new Response(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>爱发电安全补单</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; }
    body { margin: 0; background: #f6f3ff; color: #241d32; }
    main { max-width: 560px; margin: 0 auto; padding: 32px 20px; }
    section { background: white; border-radius: 18px; padding: 24px; box-shadow: 0 10px 30px #36245a14; }
    h1 { margin: 0 0 12px; font-size: 24px; }
    p { line-height: 1.65; color: #61576f; }
    label { display: block; margin-top: 18px; font-weight: 650; }
    input { box-sizing: border-box; width: 100%; margin-top: 8px; padding: 13px 14px; border: 1px solid #cec5dc; border-radius: 10px; font-size: 16px; }
    button { width: 100%; margin-top: 22px; padding: 14px; border: 0; border-radius: 10px; background: #7553d6; color: white; font-size: 16px; font-weight: 700; }
    .notice { margin: 0 0 18px; padding: 12px 14px; border-radius: 10px; background: #f0ebff; color: #432d7d; }
    .error { background: #fff0f0; color: #8b2424; }
    small { display: block; margin-top: 8px; color: #7b7187; line-height: 1.5; }
  </style>
</head>
<body><main><section>${content}</section></main></body>
</html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function formPage(orderNumber: string, notice = ''): Response {
  return htmlResponse(`${notice}
    <h1>爱发电安全补单</h1>
    <p>此页面只调用爱发电官方 API 回查真实订单，并复用现有幂等入账逻辑。不会凭订单号直接修改数据库。</p>
    <form method="post" autocomplete="off">
      <label>爱发电订单号
        <input name="out_trade_no" inputmode="numeric" pattern="[0-9]{20,40}" value="${orderNumber}" required>
      </label>
      <label>Webhook Token
        <input name="token" type="password" minlength="32" required>
      </label>
      <small>Token 仅随本次表单提交到你自己的 Pages 服务，不会出现在网址中。</small>
      <button type="submit">安全验单并补入账</button>
    </form>`);
}

async function reconcile(context: PagesFunctionContext): Promise<Response> {
  const expectedToken = context.env.AFDIAN_WEBHOOK_TOKEN?.trim() ?? '';
  if (!expectedToken || !context.env.DB) {
    return htmlResponse('<div class="notice error">补单服务尚未完成安全配置。</div>', 503);
  }

  const declaredLength = Number(context.request.headers.get('content-length') || 0);
  if (declaredLength > MAX_FORM_CHARS) {
    return htmlResponse('<div class="notice error">提交内容过大。</div>', 413);
  }

  const text = await context.request.text();
  if (!text || text.length > MAX_FORM_CHARS) {
    return htmlResponse('<div class="notice error">提交内容无效。</div>', 400);
  }

  const form = new URLSearchParams(text);
  const suppliedToken = form.get('token')?.trim() ?? '';
  const orderNumber = form.get('out_trade_no')?.trim() ?? '';
  if (!tokenMatches(suppliedToken, expectedToken)) {
    return formPage(ORDER_NUMBER_RE.test(orderNumber) ? orderNumber : '', '<div class="notice error">Webhook Token 不正确。</div>');
  }
  if (!ORDER_NUMBER_RE.test(orderNumber)) {
    return formPage('', '<div class="notice error">订单号格式不正确。</div>');
  }

  const webhookUrl = new URL(context.request.url);
  webhookUrl.pathname = '/api/afdian/webhook';
  webhookUrl.search = '';
  webhookUrl.searchParams.set('token', expectedToken);

  const webhookRequest = new Request(webhookUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        type: 'order',
        order: {
          out_trade_no: orderNumber,
          status: 2,
        },
      },
    }),
  });

  const response = await worker.fetch(webhookRequest, context.env, {
    waitUntil: promise => context.waitUntil(promise),
  });
  let result: WebhookResult | null = null;
  try {
    result = await response.json() as WebhookResult;
  } catch {
    result = null;
  }

  if (!response.ok || result?.ec !== 200) {
    const code = Number.isFinite(Number(result?.ec)) ? Number(result?.ec) : response.status;
    return formPage(orderNumber, `<div class="notice error">验单未通过（错误代码 ${code}），没有修改数据库。</div>`);
  }

  const stored = await context.env.DB.prepare(`
    SELECT package_credits
    FROM afdian_orders
    WHERE out_trade_no = ?
  `).bind(orderNumber).first<StoredOrder>();
  if (!stored) {
    return formPage(orderNumber, '<div class="notice error">订单未写入，请停止操作并检查日志。</div>');
  }

  const credits = Number(stored.package_credits);
  const safeCredits = Number.isFinite(credits) ? credits : 0;
  return htmlResponse(`<div class="notice">验单成功：真实订单已安全记录，本单套餐为 ${safeCredits} 次。重复提交不会重复增加次数。</div>
    <h1>补单完成</h1>
    <p>现在可以关闭本页，返回紫微斗数网站刷新付费次数。</p>`);
}

export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  if (context.request.method === 'GET') {
    const candidate = new URL(context.request.url).searchParams.get('order')?.trim() ?? '';
    return formPage(ORDER_NUMBER_RE.test(candidate) ? candidate : '');
  }
  if (context.request.method === 'POST') return reconcile(context);
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'GET, POST' },
  });
}
