interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DEEPSEEK_API_KEY: string;
  DEEPSEEK_MODEL?: string;
  ALLOWED_ORIGINS?: string;
  TURNSTILE_SECRET?: string;
  RATE_LIMITER?: RateLimitBinding;
}

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface InterpretRequest {
  chart?: unknown;
  messages?: ChatMessage[];
  turnstileToken?: string;
  clientId?: string;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'https://ziwei-doushu-5xd.pages.dev',
  'https://wdyziweidoushu666.com',
];
const MAX_BODY_BYTES = 200_000;
const MAX_CHART_CHARS = 140_000;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 8_000;

function jsonResponse(data: unknown, status: number, headers: HeadersInit): Response {
  return Response.json(data, { status, headers });
}

function parseAllowedOrigins(env: Env): Set<string> {
  const configured = env.ALLOWED_ORIGINS
    ?.split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  return new Set(configured?.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function corsHeaders(origin: string | null, allowedOrigins: Set<string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'content-type, x-ziwei-client',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };

  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function isValidMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (record.role === 'user' || record.role === 'assistant')
    && typeof record.content === 'string'
    && record.content.trim().length > 0
    && record.content.length <= MAX_MESSAGE_CHARS;
}

function normalizeRequest(value: unknown): InterpretRequest | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const messages = Array.isArray(raw.messages)
    ? raw.messages.filter(isValidMessage).slice(-MAX_MESSAGES)
    : [];

  if (messages.length === 0 || raw.chart === undefined) return null;

  return {
    chart: raw.chart,
    messages,
    turnstileToken: typeof raw.turnstileToken === 'string' ? raw.turnstileToken : undefined,
    clientId: typeof raw.clientId === 'string' ? raw.clientId.slice(0, 128) : undefined,
  };
}

async function verifyTurnstile(token: string | undefined, ip: string, secret: string): Promise<boolean> {
  if (!token) return false;

  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip !== 'unknown') form.append('remoteip', ip);

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });
  if (!response.ok) return false;

  const result = await response.json<{ success?: boolean }>();
  return result.success === true;
}

async function makeRateLimitKey(request: Request, body: InterpretRequest): Promise<string> {
  const explicitClient = request.headers.get('X-Ziwei-Client') || body.clientId;
  if (explicitClient && /^[a-zA-Z0-9._:-]{8,128}$/.test(explicitClient)) {
    return `client:${explicitClient}`;
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const userAgent = request.headers.get('User-Agent') || 'unknown';
  const bytes = new TextEncoder().encode(`${ip}|${userAgent}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `guest:${hash}`;
}

function buildSystemMessage(chart: unknown): ChatMessage {
  const chartJson = JSON.stringify(chart);
  if (!chartJson || chartJson.length > MAX_CHART_CHARS) {
    throw new Error('CHART_TOO_LARGE');
  }

  return {
    role: 'user',
    content: `以下是系统生成的紫微斗数命盘 JSON。你必须以盘面中的宫位、星曜、四化和大限数据为依据回答，不得虚构盘中不存在的信息。内容仅供传统文化学习和个人思考，不得替代医疗、法律、投资、婚姻或其他重大决策。\n\n【命盘数据】\n${chartJson}`,
  };
}

function transformDeepSeekStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let doneSent = false;

  const emitLine = (rawLine: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    const line = rawLine.trimEnd();
    if (!line.startsWith('data:')) return;

    const data = line.slice(5).trimStart();
    if (!data) return;
    if (data === '[DONE]') {
      if (!doneSent) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        doneSent = true;
      }
      return;
    }

    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string | null } }>;
      };
      const content = parsed.choices?.[0]?.delta?.content;
      if (content) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: { text: content } })}\n\n`));
      }
    } catch {
      // DeepSeek may send keep-alive comments or a line split between chunks.
    }
  };

  const transformer = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(line => emitLine(line, controller));
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer.trim()) emitLine(buffer, controller);
      if (!doneSent) controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    },
  });

  return stream.pipeThrough(transformer);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowedOrigins = parseAllowedOrigins(env);
    const headers = corsHeaders(origin, allowedOrigins);

    if (request.method === 'OPTIONS') {
      if (!origin || !allowedOrigins.has(origin)) {
        return new Response(null, { status: 403, headers });
      }
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return jsonResponse({ ok: true, service: 'ziwei-ai-api' }, 200, headers);
    }

    if (url.pathname !== '/api/interpret') {
      return jsonResponse({ error: '接口不存在' }, 404, headers);
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: '仅支持 POST 请求' }, 405, headers);
    }

    // Browser requests must come from an explicitly allowed site. Requests without Origin
    // remain available for health checks and controlled server-to-server testing.
    if (origin && !allowedOrigins.has(origin)) {
      return jsonResponse({ error: '当前来源未获授权' }, 403, headers);
    }

    if (!env.DEEPSEEK_API_KEY) {
      return jsonResponse({ error: 'AI 服务尚未配置' }, 503, headers);
    }

    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: '请求内容过大' }, 413, headers);
    }

    let rawBody: unknown;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) {
        return jsonResponse({ error: '请求内容过大' }, 413, headers);
      }
      rawBody = JSON.parse(text);
    } catch {
      return jsonResponse({ error: '请求格式错误' }, 400, headers);
    }

    const body = normalizeRequest(rawBody);
    if (!body) {
      return jsonResponse({ error: '命盘或对话内容不完整' }, 400, headers);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.TURNSTILE_SECRET) {
      const verified = await verifyTurnstile(body.turnstileToken, ip, env.TURNSTILE_SECRET);
      if (!verified) {
        return jsonResponse({ error: '人机验证失败，请刷新后重试' }, 401, headers);
      }
    }

    if (env.RATE_LIMITER) {
      const rateKey = await makeRateLimitKey(request, body);
      const { success } = await env.RATE_LIMITER.limit({ key: rateKey });
      if (!success) {
        return jsonResponse({ error: '请求过于频繁，请稍后再试' }, 429, headers);
      }
    }

    let systemMessage: ChatMessage;
    try {
      systemMessage = buildSystemMessage(body.chart);
    } catch {
      return jsonResponse({ error: '命盘数据过大或无法解析' }, 413, headers);
    }

    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
        stream: true,
        temperature: 0.45,
        max_tokens: 4096,
        messages: [systemMessage, ...(body.messages ?? [])],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      console.error('DeepSeek request failed', upstream.status, detail.slice(0, 1000));
      return jsonResponse({ error: 'AI 服务暂时不可用，请稍后重试' }, 502, headers);
    }

    return new Response(transformDeepSeekStream(upstream.body), {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },
};
